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

  if (stockCount.status !== 'approved') {
    return NextResponse.json({ error: `Cannot post stock count in status ${stockCount.status}` }, { status: 409 });
  }

  const blocked = await assertSegregationOfDuty(
    userId,
    stockCount.approved_by,
    'The user who approved the stock count cannot also post it',
    { tenantId, projectId, entityType: 'stock_counts', entityId: stockCount.id, target: 'posted' }
  );
  if (blocked) return blocked;

  const lines = await db.stock_count_lines.findMany({
    where: { stock_count_id: id },
  });

  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.stock_counts.update({
      where: { id },
      data: { status: 'posted', posted_at: now },
    });

    const adjustmentLines = lines.filter((l) => Number(l.variance_quantity) !== 0);
    if (adjustmentLines.length > 0) {
      await tx.stock_ledger_entries.createMany({
        data: adjustmentLines.map((line) => ({
          project_id: projectId!,
          warehouse_id: stockCount.warehouse_id,
          inventory_item_id: line.inventory_item_id,
          entry_type: 'adjustment',
          quantity_delta: line.variance_quantity,
          unit_cost: line.unit_cost_snapshot,
          value_delta: Math.round(Number(line.variance_quantity) * Number(line.unit_cost_snapshot) * 10000) / 10000,
          source_type: 'stock_count',
          source_id: stockCount.id,
          source_line_id: line.id,
          occurred_at: now,
          posted_by: userId,
          notes: `Stock count adjustment for ${stockCount.count_number}`,
        })),
      });
    }
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'UPDATE',
    entityType: 'stock_counts',
    entityId: stockCount.id,
    before: { status: stockCount.status },
    after: { status: 'posted', posted_at: now },
  });

  return NextResponse.json({ status: 'posted', posted_at: now });
});
