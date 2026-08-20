import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { projectId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const auth = await requireApiPermission('measurement.create', projectId);
  if (auth instanceof NextResponse) return auth;

  const measurement = await db.measurements.findUnique({
    where: { id },
    include: {
      measurement_lines: {
        include: { measurement_segments: true },
        orderBy: { line_number: 'asc' },
      },
      contracts: true,
      projects: true,
    },
  });

  if (!measurement) {
    return NextResponse.json({ error: 'Measurement not found' }, { status: 404 });
  }

  return NextResponse.json(measurement);
});

export const PATCH = withErrorHandling(async function PATCH(
  req: NextRequest,
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
    return NextResponse.json({ error: 'Can only edit measurements in draft status' }, { status: 409 });
  }

  const form = await req.formData();
  const measurement_number = (form.get('measurement_number') as string)?.trim() || undefined;
  const measurement_date = form.get('measurement_date') as string | null;
  const contract_id = (form.get('contract_id') as string)?.trim() || undefined;
  const work_package_id = (form.get('work_package_id') as string)?.trim() || null;
  const contractor_org_id = (form.get('contractor_org_id') as string)?.trim() || null;
  const summary = (form.get('summary') as string)?.trim() || null;

  const data: Record<string, unknown> = {};
  if (measurement_number !== undefined) data.measurement_number = measurement_number;
  if (measurement_date) data.measurement_date = new Date(measurement_date);
  if (contract_id !== undefined) data.contract_id = contract_id;
  if (form.has('work_package_id')) data.work_package_id = work_package_id;
  if (form.has('contractor_org_id')) data.contractor_org_id = contractor_org_id;
  if (form.has('summary')) data.summary = summary;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const updated = await db.measurements.update({ where: { id }, data });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'UPDATE',
    entityType: 'measurements',
    entityId: id,
    before: {
      measurement_number: measurement.measurement_number,
      measurement_date: measurement.measurement_date,
      contract_id: measurement.contract_id,
    },
    after: data,
  });

  return NextResponse.json(updated);
});
