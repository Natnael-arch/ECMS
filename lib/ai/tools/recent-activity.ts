import { db as defaultDb } from '@/lib/db';
import { checkToolPermissions } from './utils';

export const schema = {
  name: 'get_recent_activity',
  description:
    'Get the most recent audit events for the project translated into plain-language readable summaries (e.g. Requisition #14 was approved by John Doe 2 hours ago).',
  parameters: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'The UUID of the project' },
      limit: { type: 'number', description: 'Maximum number of recent activity events to return (default 10)' },
    },
    required: ['projectId'],
  },
};

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatEntityTypeName(type: string): string {
  const map: Record<string, string> = {
    purchase_requisition: 'Requisition',
    purchase_order: 'Purchase Order',
    ipc_certificate: 'IPC Certificate',
    boq_version: 'BOQ Version',
    boq_item: 'BOQ Item',
    measurement: 'Measurement',
    document: 'Document',
    variation: 'Variation',
    timesheet: 'Timesheet',
    payroll_batch: 'Payroll Batch',
    worker: 'Worker',
    inspection_request: 'Inspection Request',
    goods_receipt: 'Goods Receipt',
  };
  return map[type.toLowerCase()] || type.replace(/_/g, ' ');
}

function formatAuditSummary(event: any): string {
  const actor = event.app_users?.display_name || event.app_users?.email || 'A user';
  const entityType = formatEntityTypeName(event.entity_type);
  const action = (event.action || '').toUpperCase();
  const relativeTime = formatRelativeTime(new Date(event.occurred_at));

  // Determine entity reference identifier from metadata or entity_id
  const metadata = event.metadata || {};
  let ref = '';
  if (metadata.number || metadata.requisition_number || metadata.po_number || metadata.ipc_number) {
    ref = `#${metadata.number || metadata.requisition_number || metadata.po_number || metadata.ipc_number}`;
  } else if (metadata.reference || metadata.code) {
    ref = `(${metadata.reference || metadata.code})`;
  } else if (metadata.title) {
    ref = `"${metadata.title}"`;
  }

  const entityStr = ref ? `${entityType} ${ref}` : entityType;

  if (action === 'CREATE' || action === 'CREATED') {
    return `${entityStr} was created by ${actor} ${relativeTime}`;
  }
  if (action === 'SUBMIT' || action === 'SUBMITTED') {
    return `${entityStr} was submitted by ${actor} ${relativeTime}`;
  }
  if (action === 'APPROVE' || action === 'APPROVED') {
    return `${entityStr} was approved by ${actor} ${relativeTime}`;
  }
  if (action === 'CERTIFY' || action === 'CERTIFIED') {
    return `${entityStr} was certified by ${actor} ${relativeTime}`;
  }
  if (action === 'PAY' || action === 'PAID') {
    return `Payment was recorded for ${entityStr} by ${actor} ${relativeTime}`;
  }
  if (action === 'REJECT' || action === 'REJECTED') {
    return `${entityStr} was rejected by ${actor} ${relativeTime}`;
  }
  if (action === 'UPDATE' || action === 'UPDATED') {
    return `${entityStr} was updated by ${actor} ${relativeTime}`;
  }
  if (action === 'SOD_VIOLATION_BLOCKED') {
    return `Segregation of duty check blocked action on ${entityStr} for ${actor} ${relativeTime}`;
  }

  return `${actor} ${action.toLowerCase()} ${entityStr} ${relativeTime}`;
}

export async function run(
  projectId: string,
  userId: string,
  args: { projectId?: string; limit?: number } = {},
  dbClient: any = defaultDb
) {
  const targetProjectId = projectId || args.projectId;
  const limit = args.limit || 10;

  const permCheck = await checkToolPermissions(targetProjectId, userId, 'audit.read', dbClient);
  if (!permCheck.allowed) {
    return permCheck;
  }

  const events = await dbClient.audit_events.findMany({
    where: { project_id: targetProjectId },
    orderBy: { occurred_at: 'desc' },
    take: limit,
    include: {
      app_users: {
        select: { display_name: true, email: true },
      },
    },
  });

  const formattedEvents = events.map((evt: any) => ({
    timestamp: evt.occurred_at ? new Date(evt.occurred_at).toISOString() : new Date().toISOString(),
    summary: formatAuditSummary(evt),
  }));

  return {
    projectId: targetProjectId,
    events: formattedEvents,
  };
}
