import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import type { goods_receipt_status } from '@/lib/generated/prisma/client';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const transitions: Record<goods_receipt_status, goods_receipt_status[]> = {
  draft: ['submitted'],
  submitted: ['accepted', 'rejected', 'returned'],
  returned: ['submitted'],
  accepted: [],
  rejected: [],
  cancelled: [],
};

const TARGET_PERMISSIONS: Record<string, string> = {
  submitted: 'goods.receive',
  accepted: 'goods.receive',
  rejected: 'goods.receive',
  returned: 'goods.receive',
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const receipt = await db.goods_receipts.findUnique({ where: { id } });
  if (!receipt) return NextResponse.json({ error: 'Goods receipt not found' }, { status: 404 });

  const form = await req.formData();
  const target = form.get('status') as goods_receipt_status;

  const requiredPermission = TARGET_PERMISSIONS[target];
  if (!requiredPermission) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const auth = await requireApiPermission(requiredPermission, projectId);
  if (auth instanceof NextResponse) return auth;

  const allowed = transitions[receipt.status];
  if (!allowed.includes(target)) {
    return NextResponse.json({ error: `Invalid transition ${receipt.status} -> ${target}` }, { status: 409 });
  }

  const now = new Date();
  const data: {
    status: goods_receipt_status;
    submitted_at?: Date;
    accepted_by?: string;
    accepted_at?: Date;
    rejection_reason?: string;
  } = { status: target };

  if (target === 'submitted') {
    data.submitted_at = now;
  } else if (target === 'accepted') {
    const po = await db.purchase_orders.findUnique({
      where: { id: receipt.purchase_order_id },
      select: { approved_by: true },
    });
    const pairedActors = [userId, receipt.received_by].filter(Boolean) as string[];
    if (po?.approved_by && pairedActors.includes(po.approved_by)) {
      await writeAudit({
        tenantId,
        projectId,
        actorUserId: userId,
        action: 'SOD_VIOLATION_BLOCKED',
        entityType: 'goods_receipts',
        entityId: receipt.id,
        metadata: {
          detail: 'The user who approved the purchase order cannot receive the goods',
          requestedStatus: target,
        },
      });
      return NextResponse.json(
        {
          error: 'Segregation of duty violation',
          detail: 'The user who approved the purchase order cannot receive the goods',
        },
        { status: 409 }
      );
    }
    data.accepted_by = userId;
    data.accepted_at = now;
  } else if (target === 'rejected' || target === 'returned') {
    const reason = (form.get('reason') as string)?.trim() || (form.get('rejection_reason') as string)?.trim();
    if (reason) data.rejection_reason = reason;
  }

  await db.goods_receipts.update({ where: { id }, data });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'UPDATE',
    entityType: 'goods_receipts',
    entityId: receipt.id,
    before: { status: receipt.status },
    after: { status: target },
  });

  redirect('/procurement/receipts');
}
