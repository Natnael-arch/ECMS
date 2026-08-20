import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
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

  if (stockCount.status !== 'draft') {
    return NextResponse.json({ error: `Cannot submit stock count in status ${stockCount.status}` }, { status: 409 });
  }

  const lineCount = await db.stock_count_lines.count({ where: { stock_count_id: id } });
  if (lineCount === 0) {
    return NextResponse.json({ error: 'Stock count must have at least one count line' }, { status: 409 });
  }

  const updated = await db.stock_counts.update({
    where: { id },
    data: {
      status: 'submitted',
      submitted_by: userId,
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
    after: { status: 'submitted', submitted_by: userId },
  });

  redirect(`/stores/counts/${id}`);
});
