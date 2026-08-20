import { NextRequest, NextResponse } from 'next/server';
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

  const auth = await requireApiPermission('measurement.create', projectId);
  if (auth instanceof NextResponse) return auth;

  const measurement = await db.measurements.findUnique({ where: { id } });
  if (!measurement) {
    return NextResponse.json({ error: 'Measurement not found' }, { status: 404 });
  }

  if (measurement.status !== 'draft') {
    return NextResponse.json({ error: 'Can only add segments to measurements in draft status' }, { status: 409 });
  }

  const form = await req.formData();
  const measurement_line_id = (form.get('measurement_line_id') as string)?.trim();
  const start_chainage_mm = form.get('start_chainage_mm') as string | null;
  const end_chainage_mm = form.get('end_chainage_mm') as string | null;
  const offset_m = (form.get('offset_m') as string)?.trim() || null;
  const segment_value = (form.get('segment_value') as string)?.trim() || null;
  const drawing_reference = (form.get('drawing_reference') as string)?.trim() || null;
  const notes = (form.get('notes') as string)?.trim() || null;

  if (!measurement_line_id) {
    return NextResponse.json({ error: 'measurement_line_id is required' }, { status: 400 });
  }

  const line = await db.measurement_lines.findFirst({
    where: { id: measurement_line_id, measurement_id: id },
  });
  if (!line) {
    return NextResponse.json({ error: 'Measurement line not found in this measurement' }, { status: 404 });
  }

  const existingSegments = await db.measurement_segments.findMany({
    where: { measurement_line_id },
    select: { segment_number: true },
  });
  const maxSegment = existingSegments.reduce((max, s) => Math.max(max, s.segment_number), 0);

  const segment = await db.measurement_segments.create({
    data: {
      measurement_line_id,
      segment_number: maxSegment + 1,
      start_chainage_mm: start_chainage_mm ? BigInt(start_chainage_mm) : null,
      end_chainage_mm: end_chainage_mm ? BigInt(end_chainage_mm) : null,
      offset_m: offset_m ?? null,
      quantity: segment_value ?? null,
      notes,
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'measurement_segments',
    entityId: segment.id,
    after: {
      measurement_line_id,
      segment_number: segment.segment_number,
      start_chainage_mm: start_chainage_mm ?? null,
      end_chainage_mm: end_chainage_mm ?? null,
    },
  });

  return NextResponse.json(segment, { status: 201 });
});
