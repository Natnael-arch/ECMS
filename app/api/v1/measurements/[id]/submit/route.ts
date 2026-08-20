import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';
import { notifyProjectMembers } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const auth = await requireApiPermission('measurement.create', projectId);
  if (auth instanceof NextResponse) return auth;

  const measurement = await db.measurements.findUnique({ where: { id } });
  if (!measurement) {
    return NextResponse.json({ error: 'Measurement not found' }, { status: 404 });
  }

  if (measurement.status !== 'draft') {
    return NextResponse.json({ error: `Cannot submit measurement in ${measurement.status} status` }, { status: 409 });
  }

  const lineCount = await db.measurement_lines.count({ where: { measurement_id: id } });
  if (lineCount === 0) {
    return NextResponse.json({ error: 'Measurement must have at least one line before submission' }, { status: 409 });
  }

  const now = new Date();
  const updated = await db.measurements.update({
    where: { id },
    data: {
      status: 'submitted',
      submitted_by: userId,
      submitted_at: now,
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'UPDATE',
    entityType: 'measurements',
    entityId: id,
    before: { status: measurement.status },
    after: { status: 'submitted', submitted_by: userId, submitted_at: now },
  });

  await notifyProjectMembers(
    tenantId,
    projectId,
    'measurement.verify',
    'Measurement submitted for verification',
    `Measurement ${measurement.measurement_number || id} has been submitted and requires verification.`,
    'action_required',
    'measurements',
    id
  );

  redirect(`/field/measurement/${id}`);
});
