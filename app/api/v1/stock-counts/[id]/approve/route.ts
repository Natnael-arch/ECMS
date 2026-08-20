import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireApiPermission, assertSegregationOfDuty } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });
  const auth = await requireApiPermission('inventory.issue', projectId);
  if (auth instanceof NextResponse) return auth;

  const stockCount = await db.stock_counts.findUnique({ where: { id } });
  if (!stockCount) return NextResponse.json({ error: 'Stock count not found' }, { status: 404 });

  if (stockCount.status !== 'submitted') {
    return NextResponse.json({ error: `Cannot approve stock count in status ${stockCount.status}` }, { status: 409 });
  }

  const blocked = await assertSegregationOfDuty(
    userId,
    stockCount.submitted_by,
    'The user who submitted the stock count cannot also approve it',
    { tenantId, projectId, entityType: 'stock_counts', entityId: stockCount.id, target: 'approved' }
  );
  if (blocked) return blocked;

  const now = new Date();
  const updated = await db.stock_counts.update({
    where: { id },
    data: {
      status: 'approved',
      approved_by: userId,
      approved_at: now,
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'UPDATE',
    entityType: 'stock_counts',
    entityId: stockCount.id,
    before: { status: stockCount.status },
    after: { status: 'approved', approved_by: userId },
  });

  return NextResponse.json(updated);
});
