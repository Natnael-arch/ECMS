import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { IconClipboardList } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { money, date } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function PurchaseOrdersPage() {
  await requireAppUser();
  const { tenantId, projectId } = await getProjectContext();

  const orders = await db.purchase_orders.findMany({
    where: projectId ? { project_id: projectId } : { project: { tenant_id: tenantId } },
    orderBy: { created_at: 'desc' },
    include: {
      suppliers: { include: { organizations: { select: { legal_name: true } } } },
      contracts: { select: { contract_number: true } },
      purchase_order_lines: { select: { line_number: true, description: true, ordered_quantity: true, unit: true, unit_price: true, line_amount: true } },
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Purchase Orders" />
      <Card icon={<IconClipboardList size={18} />}>
        {orders.length === 0 ? (
          <EmptyState title="No purchase orders" message="Purchase orders issued to suppliers appear here." />
        ) : (
          <Table>
            <THead><TH>PO Number</TH><TH>Supplier</TH><TH>Contract</TH><TH>Status</TH><TH>Expected Delivery</TH><TH className="text-right">Total</TH><TH>Lines</TH></THead>
            <TBody>
              {orders.map((po) => (
                <TR key={po.id} className="hover:bg-ecms-elevated/40">
                  <TD className="font-medium">{po.purchase_order_number}</TD>
                  <TD className="text-ecms-muted">{po.suppliers.organizations.legal_name}</TD>
                  <TD className="text-ecms-muted">{po.contracts?.contract_number ?? '—'}</TD>
                  <TD><StatusPill status={po.status} /></TD>
                  <TD>{date(po.expected_delivery_date)}</TD>
                  <TD className="text-right font-medium">{money(Number(po.total_amount), po.currency)}</TD>
                  <TD>{po.purchase_order_lines.length}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
