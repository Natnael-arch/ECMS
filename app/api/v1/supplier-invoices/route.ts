import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { getCursorPaginationArgs, paginateResult } from '@/lib/pagination';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const { projectId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const auth = await requireApiPermission('invoice.record', projectId);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const supplierId = searchParams.get('supplier_id');
  const status = searchParams.get('status');
  const cursor = searchParams.get('cursor') ?? undefined;
  const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined;
  const orderParam = searchParams.get('order');

  let orderBy: Record<string, 'asc' | 'desc'> = { created_at: 'desc' };
  if (orderParam) {
    const [field, dir] = orderParam.split(':');
    if (field && (dir === 'asc' || dir === 'desc')) {
      orderBy = { [field]: dir };
    }
  }

  const paginationArgs = getCursorPaginationArgs({ cursor, limit, orderBy });

  const where: Record<string, unknown> = { project_id: projectId };
  if (supplierId) where.supplier_id = supplierId;
  if (status) where.status = status;

  const invoices = await db.supplier_invoices.findMany({
    where,
    include: {
      suppliers: { select: { id: true, supplier_code: true, organization_id: true } },
      _count: { select: { supplier_invoice_lines: true, supplier_payments: true } },
    },
    ...paginationArgs,
  });

  return NextResponse.json(paginateResult(invoices, paginationArgs.take - 1));
});

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const auth = await requireApiPermission('invoice.record', projectId);
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const supplierId = form.get('supplier_id') as string | null;
  const purchaseOrderId = form.get('purchase_order_id') as string | null;
  const invoiceNumber = form.get('invoice_number') as string | null;
  const invoiceDate = form.get('invoice_date') as string | null;
  const grossAmountRaw = form.get('gross_amount') as string | null;
  const currency = form.get('currency') as string | null;

  if (!supplierId) return NextResponse.json({ error: 'supplier_id is required' }, { status: 400 });
  if (!purchaseOrderId) return NextResponse.json({ error: 'purchase_order_id is required' }, { status: 400 });
  if (!invoiceNumber || invoiceNumber.trim().length === 0) {
    return NextResponse.json({ error: 'invoice_number is required' }, { status: 400 });
  }
  if (!invoiceDate) return NextResponse.json({ error: 'invoice_date is required' }, { status: 400 });
  if (!grossAmountRaw || isNaN(Number(grossAmountRaw)) || Number(grossAmountRaw) <= 0) {
    return NextResponse.json({ error: 'gross_amount is required and must be positive' }, { status: 400 });
  }

  // Validate supplier matches PO supplier
  const po = await db.purchase_orders.findUnique({ where: { id: purchaseOrderId } });
  if (!po) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
  if (po.project_id !== projectId) {
    return NextResponse.json({ error: 'Purchase order does not belong to this project' }, { status: 403 });
  }
  if (po.supplier_id !== supplierId) {
    return NextResponse.json(
      { error: 'Supplier does not match the purchase order supplier' },
      { status: 409 }
    );
  }

  // Validate supplier exists
  const supplier = await db.suppliers.findUnique({ where: { id: supplierId } });
  if (!supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });

  const grossAmount = Number(grossAmountRaw);

  const invoice = await db.supplier_invoices.create({
    data: {
      project_id: projectId!,
      supplier_id: supplierId,
      purchase_order_id: purchaseOrderId,
      invoice_number: invoiceNumber.trim(),
      invoice_date: new Date(invoiceDate),
      currency: currency || 'ETB',
      subtotal: grossAmount,
      gross_amount: grossAmount,
      status: 'draft',
      recorded_by: userId,
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'supplier_invoices',
    entityId: invoice.id,
    after: { supplier_id: supplierId, purchase_order_id: purchaseOrderId, gross_amount: grossAmount },
  });

  return NextResponse.json(invoice, { status: 201 });
});
