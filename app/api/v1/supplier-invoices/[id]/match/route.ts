import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();

  const auth = await requireApiPermission('invoice.match', projectId);
  if (auth instanceof NextResponse) return auth;

  const invoice = await db.supplier_invoices.findUnique({
    where: { id },
    include: {
      supplier_invoice_lines: {
        include: {
          purchase_order_lines: {
            include: {
              goods_receipt_lines: {
                include: { goods_receipts: { select: { status: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!invoice) return NextResponse.json({ error: 'Supplier invoice not found' }, { status: 404 });
  if (invoice.project_id !== projectId) {
    return NextResponse.json({ error: 'Invoice does not belong to this project' }, { status: 403 });
  }

  // Supersede any existing pending/exception match
  const existingMatch = await db.three_way_matches.findFirst({
    where: { supplier_invoice_id: id, status: { not: 'superseded' } },
  });
  if (existingMatch) {
    await db.three_way_matches.update({
      where: { id: existingMatch.id },
      data: { status: 'superseded', superseded_at: new Date() },
    });
  }

  // Determine run number
  const lastMatch = await db.three_way_matches.findFirst({
    where: { supplier_invoice_id: id },
    orderBy: { run_number: 'desc' },
  });
  const nextRun = (lastMatch?.run_number ?? 0) + 1;

  let overallStatus: 'passed' | 'exception' = 'passed';
  const matchLines: Array<{
    supplier_invoice_line_id: string;
    purchase_order_line_id: string;
    goods_receipt_line_id: string | null;
    po_quantity: number;
    received_quantity: number;
    invoiced_quantity: number;
    po_unit_price: number;
    invoice_unit_price: number;
    quantity_variance: number;
    price_variance: number;
    specification_match: boolean;
    status: 'passed' | 'exception';
    exception_codes: string[];
  }> = [];

  let exceptionCount = 0;

  for (const line of invoice.supplier_invoice_lines) {
    const poLine = line.purchase_order_lines;
    const invoicedQty = Number(line.invoiced_quantity);
    const invoicedPrice = Number(line.unit_price);
    const poQty = Number(poLine.ordered_quantity);
    const poPrice = Number(poLine.unit_price);

    // Find the most recent accepted goods receipt line for this PO line
    const grLine = poLine.goods_receipt_lines
      .filter((g) => g.goods_receipts.status === 'accepted')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

    const receivedQty = grLine ? Number(grLine.accepted_quantity) : 0;

    // Compare specification: match if invoice description matches PO description
    const specMatch = line.description.trim() === poLine.description.trim();

    const qtyVariance = invoicedQty - receivedQty;
    const priceVariance = invoicedPrice - poPrice;

    const exceptionCodes: string[] = [];
    if (!specMatch) exceptionCodes.push('SPEC_MISMATCH');
    if (qtyVariance !== 0) exceptionCodes.push('QTY_VARIANCE');
    if (priceVariance !== 0) exceptionCodes.push('PRICE_VARIANCE');

    const lineStatus = exceptionCodes.length === 0 ? 'passed' : 'exception';

    if (lineStatus === 'exception') {
      overallStatus = 'exception';
      exceptionCount++;
    }

    matchLines.push({
      supplier_invoice_line_id: line.id,
      purchase_order_line_id: line.purchase_order_line_id,
      goods_receipt_line_id: grLine?.id ?? null,
      po_quantity: poQty,
      received_quantity: receivedQty,
      invoiced_quantity: invoicedQty,
      po_unit_price: poPrice,
      invoice_unit_price: invoicedPrice,
      quantity_variance: qtyVariance,
      price_variance: priceVariance,
      specification_match: specMatch,
      status: lineStatus,
      exception_codes: exceptionCodes,
    });
  }

  // Create match + match lines in a transaction
  const match = await db.$transaction(async (tx) => {
    const created = await tx.three_way_matches.create({
      data: {
        supplier_invoice_id: id,
        run_number: nextRun,
        status: overallStatus,
        exception_count: exceptionCount,
        matched_by: userId,
        matched_at: new Date(),
        summary: {
          total_lines: invoice.supplier_invoice_lines.length,
          passed_lines: invoice.supplier_invoice_lines.length - exceptionCount,
          failed_lines: exceptionCount,
        },
      },
    });

    for (const ml of matchLines) {
      await tx.three_way_match_lines.create({
        data: {
          three_way_match_id: created.id,
          supplier_invoice_line_id: ml.supplier_invoice_line_id,
          purchase_order_line_id: ml.purchase_order_line_id,
          goods_receipt_line_id: ml.goods_receipt_line_id,
          po_quantity: ml.po_quantity,
          received_quantity: ml.received_quantity,
          invoiced_quantity: ml.invoiced_quantity,
          po_unit_price: ml.po_unit_price,
          invoice_unit_price: ml.invoice_unit_price,
          quantity_variance: ml.quantity_variance,
          price_variance: ml.price_variance,
          specification_match: ml.specification_match,
          status: ml.status,
          exception_codes: ml.exception_codes,
        },
      });
    }

    // Update invoice status
    const invoiceStatus = overallStatus === 'passed' ? 'matched' : 'exception';
    await tx.supplier_invoices.update({
      where: { id },
      data: { status: invoiceStatus },
    });

    return created;
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'THREE_WAY_MATCH',
    entityType: 'supplier_invoices',
    entityId: id,
    after: {
      match_id: match.id,
      status: overallStatus,
      exception_count: exceptionCount,
      run_number: nextRun,
    },
  });

  return NextResponse.json({
    ok: true,
    match_id: match.id,
    status: overallStatus,
    exception_count: exceptionCount,
    lines: matchLines.map((ml) => ({
      invoiced_quantity: ml.invoiced_quantity,
      received_quantity: ml.received_quantity,
      quantity_variance: ml.quantity_variance,
      price_variance: ml.price_variance,
      specification_match: ml.specification_match,
      status: ml.status,
      exception_codes: ml.exception_codes,
    })),
  });
});
