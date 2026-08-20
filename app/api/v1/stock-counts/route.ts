import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });
  const auth = await requireApiPermission('inventory.issue', projectId);
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const count_date = (form.get('count_date') as string)?.trim();
  const warehouse_id = (form.get('warehouse_id') as string)?.trim();
  const notes = (form.get('notes') as string)?.trim() || null;

  if (!count_date || !warehouse_id) {
    return NextResponse.json({ error: 'count_date and warehouse_id are required' }, { status: 400 });
  }

  const warehouse = await db.warehouses.findUnique({ where: { id: warehouse_id } });
  if (!warehouse) return NextResponse.json({ error: 'Invalid warehouse' }, { status: 400 });

  const existingCounts = await db.stock_counts.count({
    where: { project_id: projectId, warehouse_id },
  });
  const count_number = `SC-${String(existingCounts + 1).padStart(4, '0')}`;

  const stockCount = await db.stock_counts.create({
    data: {
      project_id: projectId,
      warehouse_id,
      count_number,
      count_date: new Date(count_date),
      status: 'draft',
      notes,
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'stock_counts',
    entityId: stockCount.id,
    after: { count_number, warehouse_id, count_date, status: 'draft' },
  });

  return NextResponse.json(stockCount, { status: 201 });
});
