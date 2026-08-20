import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { projectId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const auth = await requireApiPermission('invoice.record', projectId);
  if (auth instanceof NextResponse) return auth;

  const invoice = await db.supplier_invoices.findUnique({
    where: { id },
    include: {
      supplier_invoice_lines: {
        include: {
          purchase_order_lines: true,
        },
        orderBy: { line_number: 'asc' },
      },
      three_way_matches: {
        include: {
          three_way_match_lines: {
            include: {
              supplier_invoice_lines: true,
              purchase_order_lines: true,
              goods_receipt_lines: true,
            },
          },
        },
      },
      supplier_payments: {
        orderBy: { payment_date: 'desc' },
      },
      suppliers: { select: { id: true, supplier_code: true, organization_id: true } },
      purchase_orders: { select: { id: true, purchase_order_number: true } },
    },
  });

  if (!invoice) return NextResponse.json({ error: 'Supplier invoice not found' }, { status: 404 });

  return NextResponse.json(invoice);
});
