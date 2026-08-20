import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { projectId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });
  const auth = await requireApiPermission('inventory.issue', projectId);
  if (auth instanceof NextResponse) return auth;

  const stockCount = await db.stock_counts.findUnique({
    where: { id },
    include: {
      stock_count_lines: {
        include: { inventory_items: true },
        orderBy: { created_at: 'asc' },
      },
      warehouses: true,
    },
  });

  if (!stockCount) {
    return NextResponse.json({ error: 'Stock count not found' }, { status: 404 });
  }

  return NextResponse.json(stockCount);
});

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });
  const auth = await requireApiPermission('inventory.issue', projectId);
  if (auth instanceof NextResponse) return auth;

  const existing = await db.stock_counts.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Stock count not found' }, { status: 404 });

  if (existing.status !== 'draft') {
    return NextResponse.json({ error: 'Can only update a draft stock count' }, { status: 409 });
  }

  const form = await req.formData();
  const updates: Record<string, unknown> = {};
  const count_date = form.get('count_date');
  const notes = form.get('notes');

  if (count_date !== null) updates.count_date = new Date(count_date as string);
  if (notes !== null) updates.notes = (notes as string)?.trim() || null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const updated = await db.stock_counts.update({ where: { id }, data: updates });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'UPDATE',
    entityType: 'stock_counts',
    entityId: existing.id,
    before: { count_date: existing.count_date, notes: existing.notes },
    after: updates,
  });

  return NextResponse.json(updated);
});
