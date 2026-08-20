import { db } from '@/lib/db';

export type OutboxInput = {
  tenantId: string;
  projectId?: string | null;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  availableAt?: Date;
};

export async function enqueueEvent(input: OutboxInput) {
  return db.outbox_events.create({
    data: {
      tenant_id: input.tenantId,
      project_id: input.projectId ?? null,
      aggregate_type: input.aggregateType,
      aggregate_id: input.aggregateId,
      event_type: input.eventType,
      payload: input.payload as any,
      available_at: input.availableAt ?? new Date(),
    },
  });
}
