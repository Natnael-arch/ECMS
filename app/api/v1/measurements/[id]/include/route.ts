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

  const auth = await requireApiPermission('ipc.prepare', projectId);
  if (auth instanceof NextResponse) return auth;

  const measurement = await db.measurements.findUnique({ where: { id } });
  if (!measurement) {
    return NextResponse.json({ error: 'Measurement not found' }, { status: 404 });
  }

  if (measurement.status !== 'verified') {
    return NextResponse.json(
      { error: `Cannot include measurement in IPC from ${measurement.status} status (must be verified)` },
      { status: 409 }
    );
  }

  const form = await req.formData();
  const ipc_id = (form.get('ipc_id') as string)?.trim();

  if (!ipc_id) {
    return NextResponse.json({ error: 'ipc_id is required' }, { status: 400 });
  }

  const ipc = await db.ipc_certificates.findUnique({ where: { id: ipc_id } });
  if (!ipc) {
    return NextResponse.json({ error: 'IPC not found' }, { status: 404 });
  }

  const lines = await db.measurement_lines.findMany({
    where: { measurement_id: id },
    select: { id: true, accepted_quantity: true, submitted_quantity: true, boq_item_id: true },
  });

  if (lines.length === 0) {
    return NextResponse.json({ error: 'Measurement has no lines to include' }, { status: 409 });
  }

  for (const line of lines) {
    const quantity = line.accepted_quantity ?? line.submitted_quantity;

    let ipcLine = await db.ipc_lines.findFirst({
      where: { ipc_id, boq_item_id: line.boq_item_id },
    });

    if (!ipcLine) {
      const boqItem = await db.boq_items.findUnique({ where: { id: line.boq_item_id } });
      if (!boqItem) continue;

      const existingIpcLines = await db.ipc_lines.findMany({
        where: { ipc_id },
        select: { line_number: true },
      });
      const maxLine = existingIpcLines.reduce((max, l) => Math.max(max, l.line_number), 0);

      ipcLine = await db.ipc_lines.create({
        data: {
          ipc_id,
          line_number: maxLine + 1,
          boq_item_id: line.boq_item_id,
          item_number_snapshot: boqItem.item_number,
          source_code_snapshot: boqItem.source_code,
          description_snapshot: boqItem.description,
          unit_snapshot: boqItem.unit,
          contract_quantity_snapshot: boqItem.approved_quantity,
          rate_snapshot: boqItem.rate ?? 0,
        },
      });
    }

    await db.ipc_measurement_links.create({
      data: {
        ipc_line_id: ipcLine.id,
        measurement_line_id: line.id,
        quantity_included: quantity,
        created_by: userId,
      },
    });
  }

  const updated = await db.measurements.update({
    where: { id },
    data: { status: 'included' },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'UPDATE',
    entityType: 'measurements',
    entityId: id,
    before: { status: measurement.status },
    after: { status: 'included', ipc_id },
  });

  return NextResponse.json(updated);
});
