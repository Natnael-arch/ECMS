import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import type { payroll_status } from '@/lib/generated/prisma/client';
import { db } from '@/lib/db';
import { requireApiPermission, assertSegregationOfDuty } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

const transitions: Record<payroll_status, payroll_status[]> = {
  draft: ['submitted'],
  calculated: ['submitted', 'approved'],
  submitted: ['approved'],
  returned: ['submitted'],
  approved: [],
  partially_paid: [],
  paid: [],
  cancelled: [],
};

const TARGET_PERMISSIONS: Record<string, string> = {
  submitted: 'payroll.prepare',
  approved: 'payroll.approve',
};

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const payroll = await db.payroll_batches.findUnique({ where: { id } });
  if (!payroll) return NextResponse.json({ error: 'Payroll batch not found' }, { status: 404 });

  const form = await req.formData();
  const target = form.get('status') as payroll_status;

  const requiredPermission = TARGET_PERMISSIONS[target];
  if (!requiredPermission) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const auth = await requireApiPermission(requiredPermission, projectId);
  if (auth instanceof NextResponse) return auth;

  const allowed = transitions[payroll.status];
  if (!allowed.includes(target)) {
    return NextResponse.json(
      { error: `Invalid transition ${payroll.status} -> ${target}` },
      { status: 409 }
    );
  }

  const now = new Date();
  const data: {
    status: payroll_status;
    submitted_by?: string;
    submitted_at?: Date;
    approved_by?: string;
    approved_at?: Date;
  } = { status: target };

  if (target === 'submitted') {
    data.submitted_by = userId;
    data.submitted_at = now;
  } else if (target === 'approved') {
    const blocked = await assertSegregationOfDuty(
      userId,
      payroll.prepared_by ?? payroll.submitted_by,
      'The user who prepared a payroll batch cannot also approve it',
      { tenantId, projectId, entityType: 'payroll_batches', entityId: payroll.id, target }
    );
    if (blocked) return blocked;
    data.approved_by = userId;
    data.approved_at = now;
  }

  await db.payroll_batches.update({ where: { id }, data });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'UPDATE',
    entityType: 'payroll_batches',
    entityId: payroll.id,
    before: { status: payroll.status },
    after: { status: target },
  });

  redirect('/workforce/payroll');
});
