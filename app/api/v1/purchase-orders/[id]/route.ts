import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import type { purchase_order_status } from '@/lib/generated/prisma/client';
import { db } from '@/lib/db';
import { requireApiPermission, assertSegregationOfDuty } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

const transitions: Record<purchase_order_status, purchase_order_status[]> = {
  draft: ['approved'],
  approved: ['issued'],
  issued: [],
  partially_received: [],
  fully_received: [],
  closed: [],
  cancelled: [],
};

const TARGET_PERMISSIONS: Record<string, string> = {
  approved: 'procurement.approve',
  issued: 'procurement.order',
};

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const po = await db.purchase_orders.findUnique({ where: { id } });
  if (!po) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });

  const form = await req.formData();
  const target = form.get('status') as purchase_order_status;

  const requiredPermission = TARGET_PERMISSIONS[target];
  if (!requiredPermission) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const auth = await requireApiPermission(requiredPermission, projectId);
  if (auth instanceof NextResponse) return auth;

  const allowed = transitions[po.status];
  if (!allowed.includes(target)) {
    return NextResponse.json({ error: `Invalid transition ${po.status} -> ${target}` }, { status: 409 });
  }

  const now = new Date();
  const data: {
    status: purchase_order_status;
    approved_by?: string;
    approved_at?: Date;
    issued_by?: string;
    issued_at?: Date;
  } = { status: target };

  if (target === 'approved') {
    const blocked = await assertSegregationOfDuty(
      userId,
      po.created_by,
      'The user who created a purchase order cannot also approve it',
      { tenantId, projectId, entityType: 'purchase_orders', entityId: po.id, target }
    );
    if (blocked) return blocked;
    data.approved_by = userId;
    data.approved_at = now;
  } else if (target === 'issued') {
    const sourceLines = await db.purchase_order_lines.findMany({
      where: { purchase_order_id: po.id },
      select: {
        purchase_requisition_lines: {
          select: { purchase_requisitions: { select: { requested_by: true } } },
        },
      },
    });
    const requesters = Array.from(
      new Set(
        sourceLines
          .map((l) => l.purchase_requisition_lines.purchase_requisitions.requested_by)
          .filter((r): r is string => Boolean(r))
      )
    );
    for (const requester of requesters) {
      const blocked = await assertSegregationOfDuty(
        userId,
        requester,
        'The user who requested the source requisition cannot issue the purchase order',
        { tenantId, projectId, entityType: 'purchase_orders', entityId: po.id, target }
      );
      if (blocked) return blocked;
    }
    data.issued_by = userId;
    data.issued_at = now;
  }

  await db.purchase_orders.update({ where: { id }, data });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'UPDATE',
    entityType: 'purchase_orders',
    entityId: po.id,
    before: { status: po.status },
    after: { status: target },
  });

  if (target === 'approved' && po.created_by) {
    await createNotification({
      tenantId,
      userId: po.created_by,
      projectId: projectId ?? undefined,
      title: 'Purchase order approved',
      body: `Purchase order ${po.purchase_order_number || id} has been approved.`,
      notificationType: 'info',
      targetType: 'purchase_orders',
      targetId: po.id,
    });
  }

  redirect('/procurement/orders');
});
