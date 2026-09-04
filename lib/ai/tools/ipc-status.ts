import { db as defaultDb } from '@/lib/db';
import { checkToolPermissions } from './utils';

export const schema = {
  name: 'get_ipc_status',
  description:
    'Get list of IPCs (Interim Payment Certificates) with status, period, work amount, retention, net amount, and calculation status for the current draft/in-progress IPC.',
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
  const permCheck = await checkToolPermissions(targetProjectId, userId, 'ipc.read', dbClient);
  if (!permCheck.allowed) {
    return permCheck;
  }

  const ipcs = await dbClient.ipc_certificates.findMany({
    where: { project_id: targetProjectId },
    orderBy: { ipc_number: 'asc' },
    include: {
      _count: {
        select: { ipc_lines: true },
      },
    },
  });

  const ipcsList = ipcs.map((ipc: any) => ({
    id: ipc.id,
    ipcNumber: ipc.ipc_number,
    certificateReference: ipc.certificate_reference,
    periodStart: ipc.period_start,
    periodEnd: ipc.period_end,
    status: ipc.status,
    currency: ipc.currency,
    workAmount: Number(ipc.current_work_amount || 0),
    retention: Number(ipc.current_retention || 0),
    netAmount: Number(ipc.net_current_amount || 0),
    cumulativeWorkAmount: Number(ipc.cumulative_work_amount || 0),
    cumulativeRetention: Number(ipc.cumulative_retention || 0),
    cumulativeNetAmount: Number(ipc.cumulative_net_amount || 0),
  }));

  // Identify in-progress IPC (draft, submitted, under_review, recommended)
  const inProgressIpcRaw = ipcs.find((ipc: any) =>
    ['draft', 'submitted', 'under_review', 'recommended'].includes(ipc.status)
  );

  let currentInProgressStatus = null;
  if (inProgressIpcRaw) {
    currentInProgressStatus = {
      id: inProgressIpcRaw.id,
      ipcNumber: inProgressIpcRaw.ipc_number,
      status: inProgressIpcRaw.status,
      periodStart: inProgressIpcRaw.period_start,
      periodEnd: inProgressIpcRaw.period_end,
      calculationVersion: inProgressIpcRaw.calculation_version || null,
      calculationHash: inProgressIpcRaw.calculation_hash || null,
      lineCount: inProgressIpcRaw._count?.ipc_lines ?? (inProgressIpcRaw.ipc_lines?.length || 0),
      isCalculated: Boolean(inProgressIpcRaw.calculation_hash || (inProgressIpcRaw._count?.ipc_lines ?? 0) > 0),
    };
  }

  return {
    projectId: targetProjectId,
    totalIpcs: ipcsList.length,
    ipcs: ipcsList,
    currentInProgressIpc: currentInProgressStatus,
  };
}
