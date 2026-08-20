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

  const lines = await db.measurement_lines.findMany({
    where: { measurement_id: id },
    include: { measurement_segments: true },
    orderBy: { line_number: 'asc' },
  });

  return NextResponse.json(lines);
});

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
    return NextResponse.json({ error: 'Can only add lines to measurements in draft status' }, { status: 409 });
  }

  const form = await req.formData();
  const boq_item_id = (form.get('boq_item_id') as string)?.trim();
  const description = (form.get('description') as string)?.trim() || null;
  const unit = (form.get('unit') as string)?.trim();
  const calculation_method = (form.get('calculation_method') as string)?.trim() || 'direct';
  const length = form.get('length') as string | null;
  const width = form.get('width') as string | null;
  const height = form.get('height') as string | null;
  const depth = form.get('depth') as string | null;
  const submitted_quantity = (form.get('submitted_quantity') as string)?.trim();
  const drawing_reference = (form.get('drawing_reference') as string)?.trim() || null;
  const remarks = (form.get('remarks') as string)?.trim() || null;

  if (!boq_item_id || !unit || !submitted_quantity) {
    return NextResponse.json({ error: 'boq_item_id, unit and submitted_quantity are required' }, { status: 400 });
  }

  const existingLines = await db.measurement_lines.findMany({
    where: { measurement_id: id },
    select: { line_number: true },
  });
  const maxLine = existingLines.reduce((max, l) => Math.max(max, l.line_number), 0);

  const dimensions: { length?: number; width?: number; height?: number; depth?: number } = {};
  if (length) dimensions.length = parseFloat(length);
  if (width) dimensions.width = parseFloat(width);
  if (height) dimensions.height = parseFloat(height);
  if (depth) dimensions.depth = parseFloat(depth);

  let calculated_quantity = null;
  if (Object.keys(dimensions).length > 0) {
    const values = Object.values(dimensions).filter((v): v is number => v !== undefined);
    calculated_quantity = values.reduce((acc, v) => acc * v, 1);
  }

  const line = await db.measurement_lines.create({
    data: {
      measurement_id: id,
      line_number: maxLine + 1,
      boq_item_id,
      description,
      unit,
      calculation_method,
      calculation_inputs: dimensions,
      calculated_quantity,
      submitted_quantity,
      drawing_revision_id: drawing_reference || null,
      remarks,
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'measurement_lines',
    entityId: line.id,
    after: { measurement_id: id, line_number: line.line_number, boq_item_id },
  });

  return NextResponse.json(line, { status: 201 });
});
