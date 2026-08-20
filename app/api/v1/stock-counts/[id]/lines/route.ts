import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: stockCountId } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });
  const auth = await requireApiPermission('inventory.issue', projectId);
  if (auth instanceof NextResponse) return auth;

  const stockCount = await db.stock_counts.findUnique({ where: { id: stockCountId } });
  if (!stockCount) return NextResponse.json({ error: 'Stock count not found' }, { status: 404 });
  if (stockCount.status !== 'draft') {
    return NextResponse.json({ error: 'Can only add lines to a draft stock count' }, { status: 409 });
  }

  const form = await req.formData();
  const inventory_item_id = (form.get('inventory_item_id') as string)?.trim();
  const counted_quantity = parseFloat(form.get('counted_quantity') as string);
  const unit_cost_snapshot = parseFloat(form.get('unit_cost_snapshot') as string) || 0;
  const reason = (form.get('reason') as string)?.trim() || null;

  if (!inventory_item_id || isNaN(counted_quantity)) {
    return NextResponse.json({ error: 'inventory_item_id and counted_quantity are required' }, { status: 400 });
  }

  const item = await db.inventory_items.findUnique({ where: { id: inventory_item_id } });
  if (!item) return NextResponse.json({ error: 'Invalid inventory item' }, { status: 400 });

  const existingLine = await db.stock_count_lines.findFirst({
    where: { stock_count_id: stockCountId, inventory_item_id },
  });
  if (existingLine) {
    return NextResponse.json({ error: 'Item already added to this count' }, { status: 409 });
  }

  const ledgerAgg = await db.stock_ledger_entries.aggregate({
    where: {
      warehouse_id: stockCount.warehouse_id,
      inventory_item_id,
      project_id: projectId,
    },
    _sum: { quantity_delta: true },
  });
  const system_quantity = ledgerAgg._sum.quantity_delta ?? 0;
  const variance_quantity = counted_quantity - Number(system_quantity);

  const line = await db.stock_count_lines.create({
    data: {
      stock_count_id: stockCountId,
      inventory_item_id,
      system_quantity,
      counted_quantity,
      variance_quantity,
      unit_cost_snapshot,
      reason,
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'stock_count_lines',
    entityId: line.id,
    after: { stock_count_id: stockCountId, inventory_item_id, counted_quantity, system_quantity, variance_quantity },
  });

  return NextResponse.json(line, { status: 201 });
});
