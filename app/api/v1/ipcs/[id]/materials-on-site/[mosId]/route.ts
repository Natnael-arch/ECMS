import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const PATCH = withErrorHandling(async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; mosId: string }> }
) {
  const { id, mosId } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const auth = await requireApiPermission('ipc.prepare', projectId);
  if (auth instanceof NextResponse) return auth;

  const ipc = await db.ipc_certificates.findUnique({ where: { id } });
  if (!ipc) return NextResponse.json({ error: 'IPC not found' }, { status: 404 });
  if (ipc.locked_at) {
    return NextResponse.json({ error: 'Cannot modify materials on site on a locked IPC' }, { status: 409 });
  }

  const existing = await db.ipc_materials_on_site.findFirst({
    where: { id: mosId, ipc_id: id },
  });
  if (!existing) return NextResponse.json({ error: 'Materials on site entry not found' }, { status: 404 });

  const form = await req.formData();
  const updateData: Record<string, unknown> = {};

  const description = form.get('description') as string | null;
  if (description !== null) {
    if (description.trim().length === 0) {
      return NextResponse.json({ error: 'description cannot be empty' }, { status: 400 });
    }
    updateData.description = description.trim();
  }

  const quantityRaw = form.get('quantity') as string | null;
  if (quantityRaw !== null) {
    if (isNaN(Number(quantityRaw))) {
      return NextResponse.json({ error: 'quantity must be a valid number' }, { status: 400 });
    }
    updateData.quantity = Number(quantityRaw);
  }

  const unit = form.get('unit') as string | null;
  if (unit !== null) {
    if (unit.trim().length === 0) {
      return NextResponse.json({ error: 'unit cannot be empty' }, { status: 400 });
    }
    updateData.unit = unit.trim();
  }

  const unitRateRaw = form.get('unit_rate') as string | null;
  if (unitRateRaw !== null) {
    if (isNaN(Number(unitRateRaw))) {
      return NextResponse.json({ error: 'unit_rate must be a valid number' }, { status: 400 });
    }
    updateData.unit_rate = Number(unitRateRaw);
  }

  const deliveryDate = form.get('delivery_date') as string | null;
  if (deliveryDate !== null) {
    updateData.delivery_date = deliveryDate ? new Date(deliveryDate) : null;
  }

  const invoiceNumber = form.get('invoice_number') as string | null;
  if (invoiceNumber !== null) {
    updateData.invoice_number = invoiceNumber || null;
  }

  const recoveryFlag = form.get('recovery_flag') as string | null;
  if (recoveryFlag !== null) {
    updateData.recovery_flag = recoveryFlag === 'true';
  }

  // Recalculate financial fields with merged values
  const mergedQty = updateData.quantity != null ? Number(updateData.quantity) : Number(existing.gross_value) / (Number(existing.eligibility_percent) || 100);
  const mergedUnitRate = updateData.unit_rate != null ? Number(updateData.unit_rate) : Number(existing.gross_value) / (Number(existing.eligibility_percent) || 100);
  const grossValue = mergedQty * mergedUnitRate;

  const mergedEligibility = updateData.eligibility_percent != null ? Number(updateData.eligibility_percent) : Number(existing.eligibility_percent);
  const eligibleValue = grossValue * (mergedEligibility / 100);

  updateData.gross_value = grossValue;
  updateData.eligibility_percent = mergedEligibility;
  updateData.eligible_value = eligibleValue;

  if (recoveryFlag !== null) {
    const isRecovery = recoveryFlag === 'true';
    updateData.current_recovery = isRecovery ? eligibleValue : 0;
    updateData.current_credit = isRecovery ? 0 : eligibleValue;
  }

  const updated = await db.ipc_materials_on_site.update({
    where: { id: mosId },
    data: updateData,
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'UPDATE',
    entityType: 'ipc_materials_on_site',
    entityId: mosId,
    before: { gross_value: existing.gross_value, eligible_value: existing.eligible_value },
    after: { gross_value: grossValue, eligible_value: eligibleValue },
  });

  return NextResponse.json(updated);
});

export const DELETE = withErrorHandling(async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; mosId: string }> }
) {
  const { id, mosId } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const auth = await requireApiPermission('ipc.prepare', projectId);
  if (auth instanceof NextResponse) return auth;

  const ipc = await db.ipc_certificates.findUnique({ where: { id } });
  if (!ipc) return NextResponse.json({ error: 'IPC not found' }, { status: 404 });
  if (ipc.locked_at) {
    return NextResponse.json({ error: 'Cannot delete materials on site from a locked IPC' }, { status: 409 });
  }

  const existing = await db.ipc_materials_on_site.findFirst({
    where: { id: mosId, ipc_id: id },
  });
  if (!existing) return NextResponse.json({ error: 'Materials on site entry not found' }, { status: 404 });

  await db.ipc_materials_on_site.delete({ where: { id: mosId } });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'DELETE',
    entityType: 'ipc_materials_on_site',
    entityId: mosId,
    before: { description: existing.description, gross_value: existing.gross_value },
  });

  return NextResponse.json({ ok: true });
});
