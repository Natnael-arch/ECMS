import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireApiPermission, assertSegregationOfDuty } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { projectId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const auth = await requireApiPermission('ipc.prepare', projectId);
  if (auth instanceof NextResponse) return auth;

  const ipc = await db.ipc_certificates.findUnique({ where: { id } });
  if (!ipc) return NextResponse.json({ error: 'IPC not found' }, { status: 404 });

  const payments = await db.payments.findMany({
    where: { ipc_id: id },
    orderBy: { payment_date: 'desc' },
  });

  return NextResponse.json(payments);
});

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const auth = await requireApiPermission('payment.record', projectId);
  if (auth instanceof NextResponse) return auth;

  const ipc = await db.ipc_certificates.findUnique({ where: { id } });
  if (!ipc) return NextResponse.json({ error: 'IPC not found' }, { status: 404 });

  if (!['certified', 'paid'].includes(ipc.status)) {
    return NextResponse.json(
      { error: 'Payments can only be recorded against certified or paid IPCs' },
      { status: 409 }
    );
  }

  // SoD: certifier cannot record payment
  const blocked = await assertSegregationOfDuty(
    userId,
    ipc.certified_by,
    'The user who certified an IPC cannot also record its payment',
    { tenantId, projectId, entityType: 'ipc_certificates', entityId: ipc.id, target: 'payment' }
  );
  if (blocked) return blocked;

  const form = await req.formData();
  const paymentDate = form.get('payment_date') as string | null;
  const netPaidAmountRaw = form.get('net_paid_amount') as string | null;
  const paymentReference = form.get('payment_reference') as string | null;
  const currency = form.get('currency') as string | null;

  if (!paymentDate) {
    return NextResponse.json({ error: 'payment_date is required' }, { status: 400 });
  }
  if (!netPaidAmountRaw || isNaN(Number(netPaidAmountRaw)) || Number(netPaidAmountRaw) <= 0) {
    return NextResponse.json({ error: 'net_paid_amount is required and must be a positive number' }, { status: 400 });
  }
  if (!paymentReference || paymentReference.trim().length === 0) {
    return NextResponse.json({ error: 'payment_reference is required' }, { status: 400 });
  }

  const netPaidAmount = Number(netPaidAmountRaw);

  // Validate not paying more than remaining
  const existingPayments = await db.payments.findMany({
    where: { ipc_id: id },
    select: { net_paid_amount: true },
  });
  const totalPaid = existingPayments.reduce((sum, p) => sum + Number(p.net_paid_amount), 0);
  const netCurrent = Number(ipc.net_current_amount);
  const remaining = netCurrent - totalPaid;

  if (netPaidAmount > remaining) {
    return NextResponse.json(
      { error: `Payment amount ${netPaidAmount} exceeds remaining balance ${remaining}` },
      { status: 409 }
    );
  }

  const payment = await db.payments.create({
    data: {
      ipc_id: id,
      payment_reference: paymentReference.trim(),
      payment_date: new Date(paymentDate),
      currency: currency || ipc.currency,
      gross_paid_amount: netPaidAmount,
      net_paid_amount: netPaidAmount,
      recorded_by: userId,
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'payments',
    entityId: payment.id,
    after: {
      ipc_id: id,
      payment_reference: paymentReference.trim(),
      net_paid_amount: netPaidAmount,
      remaining_after: remaining - netPaidAmount,
    },
  });

  return NextResponse.json(payment, { status: 201 });
});
