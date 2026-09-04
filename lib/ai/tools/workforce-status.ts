import { db as defaultDb } from '@/lib/db';
import { checkToolPermissions } from './utils';

export const schema = {
  name: 'get_workforce_status',
  description:
    'Get workforce status including total active worker roster count, latest timesheet period status, and latest payroll batch status.',
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
  const permCheck = await checkToolPermissions(targetProjectId, userId, 'worker.manage', dbClient);
  if (!permCheck.allowed) {
    return permCheck;
  }

  // Roster Count
  const workers = await dbClient.workers.findMany({
    where: { project_id: targetProjectId },
  });

  const rosterTotalCount = workers.length;
  const activeWorkerCount = workers.filter((w: any) => w.status === 'active' || w.status === 'approved').length;

  // Latest Timesheet
  const latestTimesheet = await dbClient.timesheets.findFirst({
    where: { project_id: targetProjectId },
    orderBy: { period_end: 'desc' },
  });

  // Latest Payroll Batch
  const latestPayroll = await dbClient.payroll_batches.findFirst({
    where: { project_id: targetProjectId },
    orderBy: { period_end: 'desc' },
  });

  return {
    projectId: targetProjectId,
    roster: {
      totalCount: rosterTotalCount,
      activeCount: activeWorkerCount,
    },
    latestTimesheet: latestTimesheet
      ? {
          id: latestTimesheet.id,
          timesheetNumber: latestTimesheet.timesheet_number,
          periodStart: latestTimesheet.period_start,
          periodEnd: latestTimesheet.period_end,
          status: latestTimesheet.status,
        }
      : null,
    latestPayrollBatch: latestPayroll
      ? {
          id: latestPayroll.id,
          payrollNumber: latestPayroll.payroll_number,
          periodStart: latestPayroll.period_start,
          periodEnd: latestPayroll.period_end,
          status: latestPayroll.status,
          currency: latestPayroll.currency || 'ETB',
          grossAmount: Number(latestPayroll.gross_amount || 0),
          netAmount: Number(latestPayroll.net_amount || 0),
        }
      : null,
  };
}
