import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireApiPermission, assertSegregationOfDuty } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();

  const auth = await requireApiPermission('supplier.approve', projectId);
  if (auth instanceof NextResponse) return auth;

  const supplier = await db.suppliers.findUnique({ where: { id } });
  if (!supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
  if (supplier.tenant_id !== tenantId) {
    return NextResponse.json({ error: 'Supplier does not belong to this tenant' }, { status: 403 });
  }

  const sodBlocked = await assertSegregationOfDuty(
    userId,
    supplier.created_by,
    'The user who created a supplier cannot also approve it',
    { tenantId, projectId, entityType: 'suppliers', entityId: id, target: 'approved' }
  );
  if (sodBlocked) return sodBlocked;

  const validTransitions: Record<string, string> = {
    draft: 'approved',
    pending_approval: 'approved',
  };

  const targetStatus = validTransitions[supplier.status];
  if (!targetStatus) {
    return NextResponse.json(
      { error: `Cannot approve supplier in status '${supplier.status}'` },
      { status: 409 }
    );
  }

  const updated = await db.suppliers.update({
    where: { id },
    data: {
      status: targetStatus as 'approved',
      approved_by: userId,
      approved_at: new Date(),
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'APPROVE',
    entityType: 'suppliers',
    entityId: id,
    before: { status: supplier.status },
    after: { status: targetStatus, approved_by: userId },
  });

  return NextResponse.json({ ok: true, status: updated.status });
});
