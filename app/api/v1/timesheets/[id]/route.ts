import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import type { timesheet_status } from '@/lib/generated/prisma/client';
import { db } from '@/lib/db';
import { requireApiPermission, assertSegregationOfDuty } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { notifyProjectMembers } from '@/lib/notifications';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

const transitions: Record<timesheet_status, timesheet_status[]> = {
  draft: ['submitted'],
  submitted: ['approved', 'returned'],
  returned: ['submitted'],
  approved: [],
  included_in_payroll: [],
  cancelled: [],
};

const TARGET_PERMISSIONS: Record<string, string> = {
  submitted: 'timesheet.prepare',
  approved: 'timesheet.approve',
  returned: 'timesheet.approve',
};

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const timesheet = await db.timesheets.findUnique({ where: { id } });
  if (!timesheet) return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 });

  const form = await req.formData();
  const target = form.get('status') as timesheet_status;

  const requiredPermission = TARGET_PERMISSIONS[target];
  if (!requiredPermission) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const auth = await requireApiPermission(requiredPermission, projectId);
  if (auth instanceof NextResponse) return auth;

  const allowed = transitions[timesheet.status];
  if (!allowed.includes(target)) {
    return NextResponse.json(
      { error: `Invalid transition ${timesheet.status} -> ${target}` },
      { status: 409 }
    );
  }

  const now = new Date();
  const data: {
    status: timesheet_status;
    submitted_by?: string;
    submitted_at?: Date;
    approved_by?: string;
    approved_at?: Date;
    returned_reason?: string;
  } = { status: target };

  if (target === 'submitted') {
    data.submitted_by = userId;
    data.submitted_at = now;
  } else if (target === 'approved') {
    const blocked = await assertSegregationOfDuty(
      userId,
      timesheet.submitted_by,
      'The user who submitted a timesheet cannot also approve it',
      { tenantId, projectId, entityType: 'timesheets', entityId: timesheet.id, target }
    );
    if (blocked) return blocked;
    data.approved_by = userId;
    data.approved_at = now;
  } else if (target === 'returned') {
    const reason = (form.get('reason') as string)?.trim() || (form.get('returned_reason') as string)?.trim();
    if (reason) data.returned_reason = reason;
  }

  await db.timesheets.update({ where: { id }, data });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'UPDATE',
    entityType: 'timesheets',
    entityId: timesheet.id,
    before: { status: timesheet.status },
    after: { status: target },
  });

  if (target === 'submitted') {
    await notifyProjectMembers(
      tenantId, projectId, 'timesheet.approve',
      'Timesheet submitted for approval',
      `Timesheet ${timesheet.timesheet_number || id} has been submitted and requires approval.`,
      'action_required', 'timesheets', timesheet.id
    );
  }

  redirect('/workforce/timesheets');
});
