import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireApiPermission, assertSegregationOfDuty } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { variationTransitions } from '@/lib/transitions';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const variation = await db.variations.findUnique({ where: { id } });
  if (!variation) return NextResponse.json({ error: 'Variation not found' }, { status: 404 });

  const target = 'approved';
  const allowed = variationTransitions[variation.status];
  if (!allowed.includes(target)) {
    return NextResponse.json(
      { error: `Invalid transition ${variation.status} -> ${target}` },
      { status: 409 }
    );
  }

  const auth = await requireApiPermission('variation.approve', projectId);
  if (auth instanceof NextResponse) return auth;

  const sodBlocked = await assertSegregationOfDuty(
    userId,
    variation.initiated_by,
    'The user who initiated a variation cannot also approve it',
    { tenantId, projectId, entityType: 'variations', entityId: id, target }
  );
  if (sodBlocked) return sodBlocked;

  await db.variations.update({
    where: { id },
    data: { status: 'approved', approved_at: new Date(), approved_by: userId },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'UPDATE',
    entityType: 'variations',
    entityId: id,
    before: { status: variation.status },
    after: { status: 'approved' },
  });

  return NextResponse.json({ status: 'approved' });
});
