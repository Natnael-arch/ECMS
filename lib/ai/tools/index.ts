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

export const tools = [
  projectSummary,
  boqStatus,
  ipcStatus,
  procurementStatus,
  workforceStatus,
  recentActivity,
];

export default tools;
