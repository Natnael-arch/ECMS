import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireApiPermission, assertSegregationOfDuty } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const { projectId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const auth = await requireApiPermission('worker_payment.record', projectId);
  if (auth instanceof NextResponse) return auth;

  const payments = await db.worker_payments.findMany({
    where: {
      payroll_lines: {
        payroll_batches: { project_id: projectId! },
      },
    },
    include: {
      payroll_lines: {
        include: {
          workers: { select: { id: true, display_name: true, worker_number: true } },
          payroll_batches: { select: { id: true, payroll_number: true, status: true } },
        },
      },
    },
    orderBy: { created_at: 'desc' },
  });

  return NextResponse.json(payments);
});

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const auth = await requireApiPermission('worker_payment.record', projectId);
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const payrollLineId = form.get('payroll_line_id') as string | null;
  const amountRaw = form.get('amount') as string | null;
  const paymentDate = form.get('payment_date') as string | null;
  const paymentReference = form.get('payment_reference') as string | null;

  if (!payrollLineId) return NextResponse.json({ error: 'payroll_line_id is required' }, { status: 400 });
  if (!amountRaw || isNaN(Number(amountRaw)) || Number(amountRaw) <= 0) {
    return NextResponse.json({ error: 'amount is required and must be positive' }, { status: 400 });
  }
  if (!paymentDate) return NextResponse.json({ error: 'payment_date is required' }, { status: 400 });
  if (!paymentReference || paymentReference.trim().length === 0) {
    return NextResponse.json({ error: 'payment_reference is required' }, { status: 400 });
  }

  const payrollLine = await db.payroll_lines.findUnique({
    where: { id: payrollLineId },
    include: {
      workers: { select: { id: true, status: true } },
      payroll_batches: { select: { id: true, status: true, approved_by: true } },
    },
  });
  if (!payrollLine) return NextResponse.json({ error: 'Payroll line not found' }, { status: 404 });

  // Validate worker is active
  if (payrollLine.workers.status !== 'active') {
    return NextResponse.json({ error: 'Worker is not active' }, { status: 409 });
  }

  // Validate batch is approved
  if (payrollLine.payroll_batches.status !== 'approved' && payrollLine.payroll_batches.status !== 'partially_paid') {
    return NextResponse.json(
      { error: `Payroll batch must be approved. Current status: ${payrollLine.payroll_batches.status}` },
      { status: 409 }
    );
  }

  // SoD: batch approver cannot record payment
  const blocked = await assertSegregationOfDuty(
    userId,
    payrollLine.payroll_batches.approved_by,
    'The user who approved a payroll batch cannot also record worker payments',
    { tenantId, projectId: projectId!, entityType: 'payroll_batches', entityId: payrollLine.payroll_batches.id, target: 'payment' }
  );
  if (blocked) return blocked;

  const amount = Number(amountRaw);

  // Validate not paying more than net_amount
  const existingPayments = await db.worker_payments.findMany({
    where: { payroll_line_id: payrollLineId },
    select: { amount: true },
  });
  const totalPaid = existingPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const remaining = Number(payrollLine.net_amount) - totalPaid;

  if (amount > remaining) {
    return NextResponse.json(
      { error: `Payment amount ${amount} exceeds remaining balance ${remaining}` },
      { status: 409 }
    );
  }

  const payment = await db.worker_payments.create({
    data: {
      payroll_line_id: payrollLineId,
      payment_reference: paymentReference.trim(),
      payment_date: new Date(paymentDate),
      amount,
      payment_method: 'bank_transfer',
      recorded_by: userId,
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'worker_payments',
    entityId: payment.id,
    after: {
      payroll_line_id: payrollLineId,
      amount,
      remaining_after: remaining - amount,
    },
  });

  return NextResponse.json(payment, { status: 201 });
});
