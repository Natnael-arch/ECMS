import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireApiPermission, assertSegregationOfDuty } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';
import { notifyProjectMembers } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const auth = await requireApiPermission('measurement.verify', projectId);
  if (auth instanceof NextResponse) return auth;

  const measurement = await db.measurements.findUnique({ where: { id } });
  if (!measurement) {
    return NextResponse.json({ error: 'Measurement not found' }, { status: 404 });
  }

  if (measurement.status !== 'submitted') {
    return NextResponse.json({ error: `Cannot verify measurement in ${measurement.status} status` }, { status: 409 });
  }

  const blocked = await assertSegregationOfDuty(
    userId,
    measurement.submitted_by,
    'The user who submitted a measurement cannot also verify it',
    { tenantId, projectId, entityType: 'measurements', entityId: id, target: 'verified' }
  );
  if (blocked) return blocked;

  const form = await req.formData();
  const accepted_quantities = form.get('accepted_quantities') as string | null;

  const now = new Date();
  const updateData: {
    status: 'verified';
    verified_by: string;
    verified_at: Date;
  } = {
    status: 'verified',
    verified_by: userId,
    verified_at: now,
  };

  const updated = await db.measurements.update({ where: { id }, data: updateData });

  if (accepted_quantities) {
    try {
      const overrides: Array<{ line_id: string; accepted_quantity: string }> = JSON.parse(accepted_quantities);
      for (const override of overrides) {
        await db.measurement_lines.update({
          where: { id: override.line_id },
          data: { accepted_quantity: override.accepted_quantity },
        });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid accepted_quantities format' }, { status: 400 });
    }
  }

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'UPDATE',
    entityType: 'measurements',
    entityId: id,
    before: { status: measurement.status, submitted_by: measurement.submitted_by },
    after: { status: 'verified', verified_by: userId, verified_at: now },
  });

  await notifyProjectMembers(
    tenantId,
    projectId,
    'ipc.prepare',
    'Measurement verified — ready for IPC preparation',
    `Measurement ${measurement.measurement_number || id} has been verified and can now be included in an IPC.`,
    'info',
    'measurements',
    id
  );

  redirect(`/field/measurement/${id}`);
});
