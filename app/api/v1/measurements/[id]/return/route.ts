import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

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

  const form = await req.formData();
  const target_status = (form.get('status') as string)?.trim();
  const reason = (form.get('reason') as string)?.trim();

  if (!target_status || !reason) {
    return NextResponse.json({ error: 'status and reason are required' }, { status: 400 });
  }

  if (target_status !== 'returned' && target_status !== 'draft') {
    return NextResponse.json({ error: 'status must be "returned" or "draft"' }, { status: 400 });
  }

  if (measurement.status === 'submitted' && target_status === 'returned') {
    // allowed
  } else if (measurement.status === 'returned' && target_status === 'draft') {
    // allowed rework
  } else {
    return NextResponse.json(
      { error: `Cannot transition from ${measurement.status} to ${target_status}` },
      { status: 409 }
    );
  }

  const updated = await db.measurements.update({
    where: { id },
    data: {
      status: target_status as 'returned' | 'draft',
      returned_reason: reason,
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
    after: { status: target_status, returned_reason: reason },
  });

  redirect(`/field/measurement/${id}`);
});
