import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireApiPermission, assertSegregationOfDuty } from '@/lib/server/session';
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

  const auth = await requireApiPermission('supplier_payment.record', projectId);
  if (auth instanceof NextResponse) return auth;

  const invoice = await db.supplier_invoices.findUnique({ where: { id } });
  if (!invoice) return NextResponse.json({ error: 'Supplier invoice not found' }, { status: 404 });
  if (invoice.project_id !== projectId) {
    return NextResponse.json({ error: 'Invoice does not belong to this project' }, { status: 403 });
  }

  if (!['approved_for_payment', 'partially_paid'].includes(invoice.status)) {
    return NextResponse.json(
      { error: `Payments can only be recorded against invoices with status 'approved_for_payment' or 'partially_paid'` },
      { status: 409 }
    );
  }

  // SoD: approver cannot record payment
  const blocked = await assertSegregationOfDuty(
    userId,
    invoice.approved_by,
    'The user who approved an invoice cannot also record its payment',
    { tenantId, projectId, entityType: 'supplier_invoices', entityId: invoice.id, target: 'payment' }
  );
  if (blocked) return blocked;

  const form = await req.formData();
  const paymentDate = form.get('payment_date') as string | null;
  const grossPaidAmountRaw = form.get('gross_paid_amount') as string | null;
  const paymentReference = form.get('payment_reference') as string | null;
  const currency = form.get('currency') as string | null;

  if (!paymentDate) return NextResponse.json({ error: 'payment_date is required' }, { status: 400 });
  if (!grossPaidAmountRaw || isNaN(Number(grossPaidAmountRaw)) || Number(grossPaidAmountRaw) <= 0) {
    return NextResponse.json({ error: 'gross_paid_amount is required and must be positive' }, { status: 400 });
  }
  if (!paymentReference || paymentReference.trim().length === 0) {
    return NextResponse.json({ error: 'payment_reference is required' }, { status: 400 });
  }

  const grossPaidAmount = Number(grossPaidAmountRaw);

  // Validate not paying more than remaining
  const existingPayments = await db.supplier_payments.findMany({
    where: { supplier_invoice_id: id },
    select: { gross_paid_amount: true },
  });
  const totalPaid = existingPayments.reduce((sum, p) => sum + Number(p.gross_paid_amount), 0);
  const grossAmount = Number(invoice.gross_amount);
  const remaining = grossAmount - totalPaid;

  if (grossPaidAmount > remaining) {
    return NextResponse.json(
      { error: `Payment amount ${grossPaidAmount} exceeds remaining balance ${remaining}` },
      { status: 409 }
    );
  }

  const payment = await db.supplier_payments.create({
    data: {
      supplier_invoice_id: id,
      payment_reference: paymentReference.trim(),
      payment_date: new Date(paymentDate),
      currency: currency || invoice.currency,
      gross_paid_amount: grossPaidAmount,
      net_paid_amount: grossPaidAmount,
      recorded_by: userId,
    },
  });

  // Update invoice status
  const newTotalPaid = totalPaid + grossPaidAmount;
  const invoiceStatus = newTotalPaid >= grossAmount ? 'paid' : 'partially_paid';
  await db.supplier_invoices.update({
    where: { id },
    data: { status: invoiceStatus as 'paid' | 'partially_paid' },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'supplier_payments',
    entityId: payment.id,
    after: {
      supplier_invoice_id: id,
      gross_paid_amount: grossPaidAmount,
      remaining_after: remaining - grossPaidAmount,
      invoice_status: invoiceStatus,
    },
  });

  return NextResponse.json(payment, { status: 201 });
});
