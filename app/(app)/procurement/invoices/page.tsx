import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Badge } from '@/components/ui/Badge';
import { IconFileInvoice } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { money, date } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function SupplierInvoicesPage() {
  await requireAppUser();
  const { tenantId, projectId } = await getProjectContext();

  const [invoices, worklist] = await Promise.all([
    db.supplier_invoices.findMany({
      where: projectId ? { project_id: projectId } : { project: { tenant_id: tenantId } },
      orderBy: { invoice_date: 'desc' },
      include: {
        suppliers: { include: { organizations: { select: { legal_name: true } } } },
        purchase_orders: { select: { purchase_order_number: true } },
      },
    }),
    db.$queryRaw<Array<{ supplier_invoice_id: string; invoice_number: string; invoice_date: Date; due_date: Date | null; supplier_code: string; supplier_name: string; purchase_order_number: string; currency: string; gross_amount: number; invoice_status: string; current_match_id: string | null; match_status: string | null; exception_count: number }>>`
      SELECT supplier_invoice_id, invoice_number, invoice_date, due_date, supplier_code, supplier_name, purchase_order_number, currency, gross_amount, invoice_status, current_match_id, match_status, exception_count
      FROM ecms.v_three_way_match_worklist WHERE project_id = ${projectId ?? ''} ORDER BY invoice_date DESC`,
  ]);

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Supplier Invoices & 3-Way Match" />

      <Card title="Three-Way Match Worklist" icon={<IconFileInvoice size={18} />}>
        {worklist.length === 0 ? (
          <EmptyState title="No invoices in match worklist" message="Invoices recorded against purchase orders will appear here for matching." />
        ) : (
          <Table>
            <THead><TH>Invoice</TH><TH>Supplier</TH><TH>PO</TH><TH>Date</TH><TH>Due</TH><TH className="text-right">Gross</TH><TH>Invoice Status</TH><TH>Match</TH><TH className="text-right">Exceptions</TH></THead>
            <TBody>
              {worklist.map((w) => (
                <TR key={w.supplier_invoice_id} className="hover:bg-ecms-elevated/40">
                  <TD className="font-medium">{w.invoice_number}</TD>
                  <TD className="text-ecms-muted">{w.supplier_name}</TD>
                  <TD className="text-ecms-muted">{w.purchase_order_number}</TD>
                  <TD>{date(w.invoice_date)}</TD>
                  <TD>{date(w.due_date)}</TD>
                  <TD className="text-right font-medium">{money(Number(w.gross_amount), w.currency)}</TD>
                  <TD><StatusPill status={w.invoice_status} /></TD>
                  <TD>{w.match_status ? <StatusPill status={w.match_status} /> : <Badge tone="neutral">Not run</Badge>}</TD>
                  <TD className="text-right">{Number(w.exception_count)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card title="Invoice Register">
        {invoices.length === 0 ? (
          <EmptyState title="No supplier invoices" message="Invoices recorded against purchase orders appear here." />
        ) : (
          <Table>
            <THead><TH>Invoice</TH><TH>Supplier</TH><TH>PO</TH><TH>Date</TH><TH>Status</TH><TH className="text-right">Subtotal</TH><TH className="text-right">Tax</TH><TH className="text-right">Gross</TH></THead>
            <TBody>
              {invoices.map((i) => (
                <TR key={i.id} className="hover:bg-ecms-elevated/40">
                  <TD className="font-medium">{i.invoice_number}</TD>
                  <TD className="text-ecms-muted">{i.suppliers.organizations.legal_name}</TD>
                  <TD className="text-ecms-muted">{i.purchase_orders.purchase_order_number}</TD>
                  <TD>{date(i.invoice_date)}</TD>
                  <TD><StatusPill status={i.status} /></TD>
                  <TD className="text-right">{money(Number(i.subtotal), i.currency)}</TD>
                  <TD className="text-right">{money(Number(i.tax_amount), i.currency)}</TD>
                  <TD className="text-right font-medium">{money(Number(i.gross_amount), i.currency)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
