import { db as defaultDb } from '@/lib/db';
import { checkToolPermissions } from './utils';
import { round2 } from '@/lib/calculations/ipc';

export const schema = {
  name: 'get_project_summary',
  description:
    'Get high-level summary of the project including name, chainage/scope, contract value, physical progress %, time elapsed %, and employer/contractor/engineer organization names.',
  parameters: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'The UUID of the project' },
    },
    required: ['projectId'],
  },
};

export async function run(
  projectId: string,
  userId: string,
  args: { projectId?: string } = {},
  dbClient: any = defaultDb
) {
  const targetProjectId = projectId || args.projectId;
  const permCheck = await checkToolPermissions(targetProjectId, userId, 'contract.read', dbClient);
  if (!permCheck.allowed) {
    return permCheck;
  }

  const project = await dbClient.projects.findUnique({
    where: { id: targetProjectId },
    include: {
      contracts: {
        include: {
          contract_parties: {
            include: {
              organizations: true,
            },
          },
        },
      },
      ipc_certificates: {
        where: { status: 'certified' },
        orderBy: { period_end: 'desc' },
        take: 1,
      },
    },
  });

  if (!project) {
    return { restricted: true, reason: 'Project not found' };
  }

  const activeContract = project.contracts[0] || null;

  // Chainage format
  let scopeChainage = project.description || 'N/A';
  if (project.start_chainage_mm != null && project.end_chainage_mm != null) {
    const startKm = Number(project.start_chainage_mm) / 1_000_000;
    const endKm = Number(project.end_chainage_mm) / 1_000_000;
    scopeChainage = `km ${startKm.toFixed(3)} to km ${endKm.toFixed(3)}`;
  }

  // Contract value
  const contractValue = activeContract
    ? Number(activeContract.revised_contract_amount || activeContract.original_contract_amount || 0)
    : 0;
  const currency = activeContract?.currency || project.currency || 'ETB';

  // Parties
  let employerName = 'N/A';
  let contractorName = 'N/A';
  let engineerName = 'N/A';

  if (activeContract?.contract_parties) {
    for (const party of activeContract.contract_parties) {
      if (party.role === 'employer') employerName = party.organizations?.name || employerName;
      if (party.role === 'contractor') contractorName = party.organizations?.name || contractorName;
      if (party.role === 'engineer') engineerName = party.organizations?.name || engineerName;
    }
  }

  // Time elapsed %
  let timeElapsedPercent = 0;
  const startDate = project.actual_start_date || project.planned_start_date;
  const finishDate = project.actual_finish_date || project.planned_finish_date;
  if (startDate && finishDate) {
    const start = new Date(startDate).getTime();
    const finish = new Date(finishDate).getTime();
    const now = Date.now();
    if (finish > start) {
      const total = finish - start;
      const elapsed = Math.max(0, now - start);
      timeElapsedPercent = round2(Math.min(100, (elapsed / total) * 100));
    }
  }

  // Physical progress %
  let physicalProgressPercent = 0;
  const latestCertifiedIpc = project.ipc_certificates[0];
  if (latestCertifiedIpc && contractValue > 0) {
    const cumulativeCertifiedWork = Number(latestCertifiedIpc.cumulative_work_amount || 0);
    physicalProgressPercent = round2(Math.min(100, (cumulativeCertifiedWork / contractValue) * 100));
  }

  return {
    projectId: project.id,
    name: project.name,
    projectCode: project.project_code,
    scopeChainage,
    contractValue,
    currency,
    physicalProgressPercent,
    timeElapsedPercent,
    employerName,
    contractorName,
    engineerName,
  };
}
