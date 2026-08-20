import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const { tenantId, projectId, userId } = await getProjectContext();

  const auth = await requireApiPermission('procurement.order', projectId);
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const requisitionId = form.get('requisition_id') as string | null;
  const supplierId = form.get('supplier_id') as string | null;
  const selectedQuoteId = form.get('selected_quote_id') as string | null;

  if (!requisitionId) return NextResponse.json({ error: 'requisition_id is required' }, { status: 400 });
  if (!supplierId) return NextResponse.json({ error: 'supplier_id is required' }, { status: 400 });

  // Validate requisition
  const requisition = await db.purchase_requisitions.findUnique({
    where: { id: requisitionId },
    include: {
      purchase_requisition_lines: {
        orderBy: { line_number: 'asc' },
      },
    },
  });
  if (!requisition) return NextResponse.json({ error: 'Requisition not found' }, { status: 404 });
  if (requisition.project_id !== projectId) {
    return NextResponse.json({ error: 'Requisition does not belong to this project' }, { status: 403 });
  }
  if (requisition.status !== 'approved') {
    return NextResponse.json(
      { error: `Requisition must be approved. Current status: ${requisition.status}` },
      { status: 409 }
    );
  }
  if (requisition.purchase_requisition_lines.length === 0) {
    return NextResponse.json({ error: 'Requisition has no lines' }, { status: 409 });
  }

  // Validate supplier exists
  const supplier = await db.suppliers.findUnique({ where: { id: supplierId } });
  if (!supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });

  // Validate selected quote if provided
  if (selectedQuoteId) {
    const quote = await db.supplier_quotes.findUnique({ where: { id: selectedQuoteId } });
    if (!quote || quote.requisition_id !== requisitionId || quote.supplier_id !== supplierId) {
      return NextResponse.json(
        { error: 'Selected quote does not match the requisition or supplier' },
        { status: 409 }
      );
    }
  }

  // Generate PO number
  const lastPO = await db.purchase_orders.findFirst({
    where: { project_id: projectId! },
    orderBy: { created_at: 'desc' },
    select: { purchase_order_number: true },
  });
  let poNumber = 'PO-00001';
  if (lastPO) {
    const match = lastPO.purchase_order_number.match(/(\d+)$/);
    if (match) {
      const next = parseInt(match[1], 10) + 1;
      poNumber = `PO-${String(next).padStart(5, '0')}`;
    }
  }

  // If a quote is selected, use its prices; otherwise use requisition estimates
  let subtotal = 0;
  const poLinesData = requisition.purchase_requisition_lines.map((rl, idx) => {
    let unitPrice = Number(rl.estimated_unit_price ?? 0);
    let lineAmount = Number(rl.estimated_amount ?? 0);
    let quantity = Number(rl.requested_quantity);

    // Override with quote prices if available (will be resolved after quote lookup)
    return {
      line_number: idx + 1,
      requisition_line_id: rl.id,
      description: rl.description,
      specification: rl.specification,
      unit: rl.unit,
      ordered_quantity: quantity,
      unit_price: unitPrice,
      tax_percent: 0,
      line_amount: lineAmount,
    };
  });

  // If selected quote exists, use its line prices
  if (selectedQuoteId) {
    const quoteLines = await db.supplier_quote_lines.findMany({
      where: { supplier_quote_id: selectedQuoteId },
    });
    const quoteLineMap = new Map(quoteLines.map((ql) => [ql.requisition_line_id, ql]));

    for (const poLine of poLinesData) {
      const ql = quoteLineMap.get(poLine.requisition_line_id);
      if (ql) {
        poLine.unit_price = Number(ql.unit_price);
        poLine.line_amount = Number(ql.line_amount);
        poLine.tax_percent = Number(ql.tax_percent);
      }
    }
  }

  subtotal = poLinesData.reduce((sum, l) => sum + l.line_amount, 0);
  const taxAmount = poLinesData.reduce(
    (sum, l) => sum + l.line_amount * (l.tax_percent / 100),
    0
  );

  // Create PO + PO lines in a transaction
  const po = await db.$transaction(async (tx) => {
    const created = await tx.purchase_orders.create({
      data: {
        project_id: projectId!,
        purchase_order_number: poNumber,
        supplier_id: supplierId,
        selected_quote_id: selectedQuoteId || null,
        contract_id: requisition.contract_id,
        status: 'draft',
        currency: 'ETB',
        subtotal,
        tax_amount: taxAmount,
        total_amount: subtotal + taxAmount,
        created_by: userId,
      },
    });

    for (const lineData of poLinesData) {
      await tx.purchase_order_lines.create({
        data: {
          purchase_order_id: created.id,
          requisition_line_id: lineData.requisition_line_id,
          line_number: lineData.line_number,
          description: lineData.description,
          specification: lineData.specification,
          unit: lineData.unit,
          ordered_quantity: lineData.ordered_quantity,
          unit_price: lineData.unit_price,
          tax_percent: lineData.tax_percent,
          line_amount: lineData.line_amount,
        },
      });
    }

    // Update requisition status
    await tx.purchase_requisitions.update({
      where: { id: requisitionId },
      data: { status: 'ordered' },
    });

    return created;
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'purchase_orders',
    entityId: po.id,
    after: {
      requisition_id: requisitionId,
      supplier_id: supplierId,
      total_amount: subtotal + taxAmount,
      line_count: poLinesData.length,
    },
  });

  return NextResponse.json(
    { ok: true, purchase_order_id: po.id, po_number: poNumber, total_amount: subtotal + taxAmount },
    { status: 201 }
  );
});
