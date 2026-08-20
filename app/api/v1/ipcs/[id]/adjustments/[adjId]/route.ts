import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

const VALID_KINDS = [
  'daywork',
  'provisional_sum',
  'penalty',
  'other_addition',
  'other_deduction',
] as const;

type AdjustmentKind = (typeof VALID_KINDS)[number];

export const PATCH = withErrorHandling(async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; adjId: string }> }
) {
  const { id, adjId } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const auth = await requireApiPermission('ipc.prepare', projectId);
  if (auth instanceof NextResponse) return auth;

  const ipc = await db.ipc_certificates.findUnique({ where: { id } });
  if (!ipc) return NextResponse.json({ error: 'IPC not found' }, { status: 404 });
  if (ipc.locked_at) {
    return NextResponse.json({ error: 'Cannot modify adjustments on a locked IPC' }, { status: 409 });
  }

  const existing = await db.ipc_adjustments.findFirst({
    where: { id: adjId, ipc_id: id },
  });
  if (!existing) return NextResponse.json({ error: 'Adjustment not found' }, { status: 404 });

  const form = await req.formData();
  const updateData: Record<string, unknown> = {};

  const kind = form.get('kind') as string | null;
  if (kind !== null) {
    if (!VALID_KINDS.includes(kind as AdjustmentKind)) {
      return NextResponse.json(
        { error: `kind must be one of: ${VALID_KINDS.join(', ')}` },
        { status: 400 }
      );
    }
    updateData.kind = kind;
  }

  const description = form.get('description') as string | null;
  if (description !== null) {
    if (description.trim().length === 0) {
      return NextResponse.json({ error: 'description cannot be empty' }, { status: 400 });
    }
    updateData.description = description.trim();
  }

  const direction = form.get('direction') as string | null;
  if (direction !== null) {
    if (!['1', '-1'].includes(direction)) {
      return NextResponse.json({ error: 'direction must be 1 or -1' }, { status: 400 });
    }
    updateData.direction = direction === '1' ? 1 : -1;
  }

  const basisCode = form.get('basis_code') as string | null;
  if (basisCode !== null) updateData.basis_code = basisCode || null;

  const basisAmountRaw = form.get('basis_amount') as string | null;
  if (basisAmountRaw !== null) {
    const val = Number(basisAmountRaw);
    if (isNaN(val)) return NextResponse.json({ error: 'basis_amount must be a valid number' }, { status: 400 });
    updateData.basis_amount = val;
  }

  const percentageRaw = form.get('percentage') as string | null;
  if (percentageRaw !== null) {
    const val = Number(percentageRaw);
    if (isNaN(val) || val < 0 || val > 100) {
      return NextResponse.json({ error: 'percentage must be between 0 and 100' }, { status: 400 });
    }
    updateData.percentage = val;
  }

  const quantityRaw = form.get('quantity') as string | null;
  if (quantityRaw !== null) {
    const val = Number(quantityRaw);
    if (isNaN(val)) return NextResponse.json({ error: 'quantity must be a valid number' }, { status: 400 });
    updateData.quantity = val;
  }

  const rateRaw = form.get('rate') as string | null;
  if (rateRaw !== null) {
    const val = Number(rateRaw);
    if (isNaN(val)) return NextResponse.json({ error: 'rate must be a valid number' }, { status: 400 });
    updateData.rate = val;
  }

  const notes = form.get('notes') as string | null;
  if (notes !== null) updateData.notes = notes || null;

  // Recalculate current_amount with merged values
  const merged = {
    basis_amount: updateData.basis_amount != null ? Number(updateData.basis_amount) : existing.basis_amount != null ? Number(existing.basis_amount) : null,
    percentage: updateData.percentage != null ? Number(updateData.percentage) : existing.percentage != null ? Number(existing.percentage) : null,
    quantity: updateData.quantity != null ? Number(updateData.quantity) : existing.quantity != null ? Number(existing.quantity) : null,
    rate: updateData.rate != null ? Number(updateData.rate) : existing.rate != null ? Number(existing.rate) : null,
  };

  let currentAmount = Number(existing.current_amount);
  if (merged.quantity != null && merged.rate != null) {
    currentAmount = merged.quantity * merged.rate;
  } else if (merged.basis_amount != null && merged.percentage != null) {
    currentAmount = merged.basis_amount * (merged.percentage / 100);
  }
  updateData.current_amount = currentAmount;

  const updated = await db.ipc_adjustments.update({
    where: { id: adjId },
    data: updateData,
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'UPDATE',
    entityType: 'ipc_adjustments',
    entityId: adjId,
    before: { current_amount: existing.current_amount },
    after: { current_amount: currentAmount },
  });

  return NextResponse.json(updated);
});

export const DELETE = withErrorHandling(async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; adjId: string }> }
) {
  const { id, adjId } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const auth = await requireApiPermission('ipc.prepare', projectId);
  if (auth instanceof NextResponse) return auth;

  const ipc = await db.ipc_certificates.findUnique({ where: { id } });
  if (!ipc) return NextResponse.json({ error: 'IPC not found' }, { status: 404 });
  if (ipc.locked_at) {
    return NextResponse.json({ error: 'Cannot delete adjustments from a locked IPC' }, { status: 409 });
  }

  const existing = await db.ipc_adjustments.findFirst({
    where: { id: adjId, ipc_id: id },
  });
  if (!existing) return NextResponse.json({ error: 'Adjustment not found' }, { status: 404 });

  await db.ipc_adjustments.delete({ where: { id: adjId } });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'DELETE',
    entityType: 'ipc_adjustments',
    entityId: adjId,
    before: { kind: existing.kind, description: existing.description, current_amount: existing.current_amount },
  });

  return NextResponse.json({ ok: true });
});
