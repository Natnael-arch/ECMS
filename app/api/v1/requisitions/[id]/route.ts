import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import type { purchase_requisition_status } from '@/lib/generated/prisma/client';
import { db } from '@/lib/db';
import { requireApiPermission, assertSegregationOfDuty } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { notifyProjectMembers } from '@/lib/notifications';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

const transitions: Record<purchase_requisition_status, purchase_requisition_status[]> = {
  draft: ['submitted'],
  submitted: ['approved', 'rejected', 'returned'],
  returned: ['submitted'],
  approved: [],
  rejected: [],
  ordered: [],
  cancelled: [],
};

const TARGET_PERMISSIONS: Record<string, string> = {
  submitted: 'procurement.request',
  approved: 'procurement.approve',
  rejected: 'procurement.approve',
  returned: 'procurement.approve',
};

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const requisition = await db.purchase_requisitions.findUnique({ where: { id } });
  if (!requisition) return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });

  const form = await req.formData();
  const target = form.get('status') as purchase_requisition_status;

  const requiredPermission = TARGET_PERMISSIONS[target];
  if (!requiredPermission) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const auth = await requireApiPermission(requiredPermission, projectId);
  if (auth instanceof NextResponse) return auth;

  const allowed = transitions[requisition.status];
  if (!allowed.includes(target)) {
    return NextResponse.json(
      { error: `Invalid transition ${requisition.status} -> ${target}` },
      { status: 409 }
    );
  }

  const now = new Date();
  const data: {
    status: purchase_requisition_status;
    submitted_at?: Date;
    approved_by?: string;
    approved_at?: Date;
    returned_reason?: string;
  } = { status: target };

  if (target === 'submitted') {
    data.submitted_at = now;
  } else if (target === 'approved') {
    const blocked = await assertSegregationOfDuty(
      userId,
      requisition.requested_by,
      'The user who requested a requisition cannot also approve it',
      { tenantId, projectId, entityType: 'purchase_requisitions', entityId: requisition.id, target }
    );
    if (blocked) return blocked;
    data.approved_by = userId;
    data.approved_at = now;
  } else if (target === 'returned') {
    const reason = (form.get('reason') as string)?.trim() || (form.get('returned_reason') as string)?.trim();
    if (reason) data.returned_reason = reason;
  }

  await db.purchase_requisitions.update({ where: { id }, data });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'UPDATE',
    entityType: 'purchase_requisitions',
    entityId: requisition.id,
    before: { status: requisition.status },
    after: { status: target },
  });

  if (target === 'submitted') {
    await notifyProjectMembers(
      tenantId, projectId, 'procurement.approve',
      'Requisition submitted for approval',
      `Requisition ${requisition.requisition_number || id} has been submitted and requires approval.`,
      'action_required', 'purchase_requisitions', requisition.id
    );
  }

  redirect('/procurement/requisitions');
});
