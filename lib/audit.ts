import { db } from '@/lib/db';

export type AuditInput = {
  tenantId: string;
  projectId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
};

export async function writeAudit(input: AuditInput) {
  return db.audit_events.create({
    data: {
      tenant_id: input.tenantId,
      project_id: input.projectId ?? null,
      actor_user_id: input.actorUserId ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      before_data: input.before ?? undefined,
      after_data: input.after ?? undefined,
      metadata: input.metadata ?? {},
    },
  });
}
