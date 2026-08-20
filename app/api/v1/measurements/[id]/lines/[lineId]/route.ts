import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const PATCH = withErrorHandling(async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> }
) {
  const { id, lineId } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const auth = await requireApiPermission('measurement.create', projectId);
  if (auth instanceof NextResponse) return auth;

  const measurement = await db.measurements.findUnique({ where: { id } });
  if (!measurement) {
    return NextResponse.json({ error: 'Measurement not found' }, { status: 404 });
  }

  if (measurement.status !== 'draft') {
    return NextResponse.json({ error: 'Can only edit lines on measurements in draft status' }, { status: 409 });
  }

  const existing = await db.measurement_lines.findFirst({
    where: { id: lineId, measurement_id: id },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Line not found' }, { status: 404 });
  }

  const form = await req.formData();
  const boq_item_id = (form.get('boq_item_id') as string)?.trim() || undefined;
  const description = (form.get('description') as string)?.trim() || null;
  const unit = (form.get('unit') as string)?.trim() || undefined;
  const calculation_method = (form.get('calculation_method') as string)?.trim() || undefined;
  const length = form.get('length') as string | null;
  const width = form.get('width') as string | null;
  const height = form.get('height') as string | null;
  const depth = form.get('depth') as string | null;
  const submitted_quantity = (form.get('submitted_quantity') as string)?.trim() || undefined;
  const drawing_reference = (form.get('drawing_reference') as string)?.trim() || null;
  const remarks = (form.get('remarks') as string)?.trim() || null;

  const data: Record<string, unknown> = {};
  if (boq_item_id !== undefined) data.boq_item_id = boq_item_id;
  if (form.has('description')) data.description = description;
  if (unit !== undefined) data.unit = unit;
  if (calculation_method !== undefined) data.calculation_method = calculation_method;
  if (submitted_quantity !== undefined) data.submitted_quantity = submitted_quantity;
  if (form.has('drawing_reference')) data.drawing_revision_id = drawing_reference;
  if (form.has('remarks')) data.remarks = remarks;

  const hasDimensions = form.has('length') || form.has('width') || form.has('height') || form.has('depth');
  if (hasDimensions) {
    const dimensions: { length?: number; width?: number; height?: number; depth?: number } = {};
    if (length) dimensions.length = parseFloat(length);
    if (width) dimensions.width = parseFloat(width);
    if (height) dimensions.height = parseFloat(height);
    if (depth) dimensions.depth = parseFloat(depth);
    data.calculation_inputs = dimensions;

    const values = Object.values(dimensions).filter((v): v is number => v !== undefined);
    data.calculated_quantity = values.length > 0 ? values.reduce((acc, v) => acc * v, 1) : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const updated = await db.measurement_lines.update({ where: { id: lineId }, data });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'UPDATE',
    entityType: 'measurement_lines',
    entityId: lineId,
    before: {
      boq_item_id: existing.boq_item_id,
      unit: existing.unit,
      submitted_quantity: existing.submitted_quantity,
    },
    after: data,
  });

  return NextResponse.json(updated);
});

export const DELETE = withErrorHandling(async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> }
) {
  const { id, lineId } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const auth = await requireApiPermission('measurement.create', projectId);
  if (auth instanceof NextResponse) return auth;

  const measurement = await db.measurements.findUnique({ where: { id } });
  if (!measurement) {
    return NextResponse.json({ error: 'Measurement not found' }, { status: 404 });
  }

  if (measurement.status !== 'draft') {
    return NextResponse.json({ error: 'Can only delete lines from measurements in draft status' }, { status: 409 });
  }

  const existing = await db.measurement_lines.findFirst({
    where: { id: lineId, measurement_id: id },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Line not found' }, { status: 404 });
  }

  await db.measurement_lines.delete({ where: { id: lineId } });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'DELETE',
    entityType: 'measurement_lines',
    entityId: lineId,
    before: { measurement_id: id, line_number: existing.line_number, boq_item_id: existing.boq_item_id },
  });

  return new NextResponse(null, { status: 204 });
});
