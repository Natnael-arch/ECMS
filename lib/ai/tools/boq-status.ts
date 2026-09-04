import { db as defaultDb } from '@/lib/db';
import { checkToolPermissions } from './utils';
import { round2 } from '@/lib/calculations/ipc';

export const schema = {
  name: 'get_boq_status',
  description:
    'Get BOQ (Bill of Quantities) status per item or section, including original/approved quantity, cumulative certified quantity, % complete, and flags for items over 90% of BOQ quantity or in overrun.',
  parameters: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'The UUID of the project' },
      sectionId: { type: 'string', description: 'Optional section UUID to filter by section' },
    },
    required: ['projectId'],
  },
};

export async function run(
  projectId: string,
  userId: string,
  args: { projectId?: string; sectionId?: string } = {},
  dbClient: any = defaultDb
) {
  const targetProjectId = projectId || args.projectId;
  const permCheck = await checkToolPermissions(targetProjectId, userId, 'boq.read', dbClient);
  if (!permCheck.allowed) {
    return permCheck;
  }

  // Find active/latest BOQ version for project
  const boqVersion = await dbClient.boq_versions.findFirst({
    where: { project_id: targetProjectId },
    orderBy: { version_number: 'desc' },
  });

  if (!boqVersion) {
    return {
      projectId: targetProjectId,
      boqVersionId: null,
      items: [],
      over90PercentCount: 0,
      overrunCount: 0,
    };
  }

  const whereClause: any = { boq_version_id: boqVersion.id };
  if (args.sectionId) {
    whereClause.section_id = args.sectionId;
  }

  const boqItems = await dbClient.boq_items.findMany({
    where: whereClause,
    include: {
      boq_sections: true,
    },
    orderBy: { sort_order: 'asc' },
  });

  // Get cumulative certified quantity per item from latest certified IPC
  const latestCertifiedIpc = await dbClient.ipc_certificates.findFirst({
    where: { project_id: targetProjectId, status: 'certified' },
    orderBy: { period_end: 'desc' },
    include: {
      ipc_lines: true,
    },
  });

  const certifiedQtyMap = new Map<string, number>();
  if (latestCertifiedIpc?.ipc_lines) {
    for (const line of latestCertifiedIpc.ipc_lines) {
      certifiedQtyMap.set(line.boq_item_id, Number(line.cumulative_quantity || 0));
    }
  }

  let over90PercentCount = 0;
  let overrunCount = 0;

  const items = boqItems.map((item: any) => {
    const originalQuantity = Number(item.original_quantity || 0);
    const approvedQuantity = Number(item.approved_quantity ?? originalQuantity);
    const cumulativeCertifiedQuantity = certifiedQtyMap.get(item.id) || 0;
    
    const percentComplete = approvedQuantity > 0
      ? round2((cumulativeCertifiedQuantity / approvedQuantity) * 100)
      : 0;

    const isOver90Percent = percentComplete >= 90;
    const isOverrun = approvedQuantity > 0 && cumulativeCertifiedQuantity > approvedQuantity;

    if (isOver90Percent) over90PercentCount++;
    if (isOverrun) overrunCount++;

    return {
      id: item.id,
      itemNumber: item.item_number,
      sourceCode: item.source_code,
      description: item.description,
      unit: item.unit,
      section: item.boq_sections
        ? { id: item.boq_sections.id, code: item.boq_sections.section_code, title: item.boq_sections.title }
        : null,
      originalQuantity,
      approvedQuantity,
      rate: Number(item.rate || 0),
      cumulativeCertifiedQuantity,
      percentComplete,
      isOver90Percent,
      isOverrun,
      overrunQuantity: isOverrun ? round2(cumulativeCertifiedQuantity - approvedQuantity) : 0,
    };
  });

  return {
    projectId: targetProjectId,
    boqVersionId: boqVersion.id,
    versionNumber: boqVersion.version_number,
    totalItems: items.length,
    over90PercentCount,
    overrunCount,
    items,
  };
}
