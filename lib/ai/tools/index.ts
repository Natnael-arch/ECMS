import * as projectSummary from './project-summary';
import * as boqStatus from './boq-status';
import * as ipcStatus from './ipc-status';
import * as procurementStatus from './procurement-status';
import * as workforceStatus from './workforce-status';
import * as recentActivity from './recent-activity';

export {
  projectSummary,
  boqStatus,
  ipcStatus,
  procurementStatus,
  workforceStatus,
  recentActivity,
};

export const TOOL_FRIENDLY_NAMES: Record<string, string> = {
  get_project_summary: 'Project summary',
  get_boq_status: 'BOQ status',
  get_ipc_status: 'IPC status',
  get_procurement_status: 'Procurement status',
  get_workforce_status: 'Workforce status',
  get_recent_activity: 'Recent activity',
};

export const tools = [
  projectSummary,
  boqStatus,
  ipcStatus,
  procurementStatus,
  workforceStatus,
  recentActivity,
];

export default tools;
