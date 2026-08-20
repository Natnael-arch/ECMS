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

export const GET = withErrorHandling(async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { projectId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const auth = await requireApiPermission('ipc.prepare', projectId);
  if (auth instanceof NextResponse) return auth;

  const ipc = await db.ipc_certificates.findUnique({ where: { id } });
  if (!ipc) return NextResponse.json({ error: 'IPC not found' }, { status: 404 });

  const adjustments = await db.ipc_adjustments.findMany({
    where: { ipc_id: id },
    orderBy: { line_number: 'asc' },
  });

  return NextResponse.json(adjustments);
});

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const auth = await requireApiPermission('ipc.prepare', projectId);
  if (auth instanceof NextResponse) return auth;

  const ipc = await db.ipc_certificates.findUnique({ where: { id } });
  if (!ipc) return NextResponse.json({ error: 'IPC not found' }, { status: 404 });
  if (ipc.locked_at) {
    return NextResponse.json({ error: 'Cannot add adjustments to a locked IPC' }, { status: 409 });
  }

  const form = await req.formData();
  const kind = form.get('kind') as string | null;
  const description = form.get('description') as string | null;
  const direction = form.get('direction') as string | null;
  const basisCode = form.get('basis_code') as string | null;
  const basisAmountRaw = form.get('basis_amount') as string | null;
  const percentageRaw = form.get('percentage') as string | null;
  const quantityRaw = form.get('quantity') as string | null;
  const rateRaw = form.get('rate') as string | null;
  const notes = form.get('notes') as string | null;

  if (!kind || !VALID_KINDS.includes(kind as AdjustmentKind)) {
    return NextResponse.json(
      { error: `kind must be one of: ${VALID_KINDS.join(', ')}` },
      { status: 400 }
    );
  }
  if (!description || description.trim().length === 0) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 });
  }
  if (!direction || !['1', '-1'].includes(direction)) {
    return NextResponse.json({ error: 'direction must be 1 (addition) or -1 (deduction)' }, { status: 400 });
  }

  const directionInt = direction === '1' ? 1 : -1;
  const basisAmount = basisAmountRaw ? Number(basisAmountRaw) : null;
  const percentage = percentageRaw ? Number(percentageRaw) : null;
  const quantity = quantityRaw ? Number(quantityRaw) : null;
  const rate = rateRaw ? Number(rateRaw) : null;

  if (basisAmountRaw && isNaN(basisAmount!)) {
    return NextResponse.json({ error: 'basis_amount must be a valid number' }, { status: 400 });
  }
  if (percentageRaw && (isNaN(percentage!) || percentage! < 0 || percentage! > 100)) {
    return NextResponse.json({ error: 'percentage must be between 0 and 100' }, { status: 400 });
  }
  if (quantityRaw && isNaN(quantity!)) {
    return NextResponse.json({ error: 'quantity must be a valid number' }, { status: 400 });
  }
  if (rateRaw && isNaN(rate!)) {
    return NextResponse.json({ error: 'rate must be a valid number' }, { status: 400 });
  }

  // Determine next line_number
  const lastAdj = await db.ipc_adjustments.findFirst({
    where: { ipc_id: id },
    orderBy: { line_number: 'desc' },
  });
  const nextLine = (lastAdj?.line_number ?? 0) + 1;

  // Calculate current_amount
  let currentAmount = 0;
  if (quantity != null && rate != null) {
    currentAmount = quantity * rate;
  } else if (basisAmount != null && percentage != null) {
    currentAmount = basisAmount * (percentage / 100);
  } else if (quantity != null && rate != null) {
    currentAmount = quantity * rate;
  }

  const adjustment = await db.ipc_adjustments.create({
    data: {
      ipc_id: id,
      line_number: nextLine,
      kind: kind as AdjustmentKind,
      description: description.trim(),
      direction: directionInt,
      basis_code: basisCode || null,
      basis_amount: basisAmount,
      percentage: percentage,
      quantity: quantity,
      rate: rate,
      current_amount: currentAmount,
      cumulative_amount: currentAmount,
      notes: notes || null,
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'ipc_adjustments',
    entityId: adjustment.id,
    after: { ipc_id: id, kind, description, direction: directionInt, current_amount: currentAmount },
  });

  return NextResponse.json(adjustment, { status: 201 });
});
