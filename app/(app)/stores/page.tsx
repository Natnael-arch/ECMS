import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Badge } from '@/components/ui/Badge';
import { IconPackages } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { num, money, date } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function StoresPage() {
  await requireAppUser();
  const { tenantId, projectId } = await getProjectContext();

  const [stock, warehouses, inventoryItems, lastMovements] = await Promise.all([
    db.$queryRaw<Array<{ inventory_item_id: string; warehouse_code: string; warehouse_name: string; item_code: string; description: string; unit: string; quantity_on_hand: number; ledger_value: number; last_movement_at: Date | null }>>`
      SELECT inventory_item_id, warehouse_code, warehouse_name, item_code, description, unit, quantity_on_hand, ledger_value, last_movement_at
      FROM ecms.v_stock_on_hand WHERE project_id = ${projectId ?? ''} ORDER BY item_code ASC, warehouse_code ASC`,
    db.warehouses.findMany({ where: projectId ? { project_id: projectId } : { projects: { tenant_id: tenantId } }, orderBy: { warehouse_code: 'asc' } }),
    db.inventory_items.findMany({ where: projectId ? { project_id: projectId } : { projects: { tenant_id: tenantId } }, orderBy: { item_code: 'asc' }, include: { _count: { select: { stock_ledger_entries: true } } } }),
    db.$queryRaw<Array<{ entry_type: string; quantity_delta: number; source_type: string; occurred_at: Date }>>`
      SELECT entry_type, quantity_delta, source_type, occurred_at FROM ecms.stock_ledger_entries
      WHERE project_id = ${projectId ?? ''} ORDER BY occurred_at DESC LIMIT 10`,
  ]);

  const totalItems = inventoryItems.length;
  const totalValue = stock.reduce((s, r) => s + Number(r.ledger_value), 0);
  const totalQty = stock.reduce((s, r) => s + Number(r.quantity_on_hand), 0);

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Stores & Stock" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5"><p className="text-sm text-ecms-muted">Catalogued Items</p><p className="mt-1 text-2xl font-bold text-ecms-text">{totalItems}</p></div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5"><p className="text-sm text-ecms-muted">Stock Ledger Value</p><p className="mt-1 text-2xl font-bold text-ecms-amber">{money(totalValue)}</p></div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5"><p className="text-sm text-ecms-muted">Qty On Hand</p><p className="mt-1 text-2xl font-bold text-ecms-text">{num(totalQty)}</p></div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card title="Stock On Hand" icon={<IconPackages size={18} />} className="xl:col-span-2">
          {stock.length === 0 ? (
            <EmptyState title="No stock movements" message="Stock balances appear here once goods receipts are posted." />
          ) : (
            <Table>
              <THead><TH>Item</TH><TH>Description</TH><TH>Warehouse</TH><TH className="text-right">On Hand</TH><TH className="text-right">Value</TH><TH>Last Movement</TH></THead>
              <TBody>
                {stock.map((r) => (
                  <TR key={`${r.inventory_item_id}-${r.warehouse_code}`} className="hover:bg-ecms-elevated/40">
                    <TD className="font-medium">{r.item_code}</TD>
                    <TD className="max-w-[240px] truncate text-ecms-muted">{r.description}</TD>
                    <TD>{r.warehouse_code}</TD>
                    <TD className="text-right font-medium">{num(r.quantity_on_hand)} {r.unit}</TD>
                    <TD className="text-right">{money(Number(r.ledger_value))}</TD>
                    <TD>{date(r.last_movement_at)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <div className="flex flex-col gap-5">
          <Card title="Warehouses">
            <Table>
              <THead><TH>Code</TH><TH>Name</TH><TH>Status</TH></THead>
              <TBody>
                {warehouses.map((w) => (
                  <TR key={w.id}>
                    <TD className="font-medium">{w.warehouse_code}</TD>
                    <TD className="text-ecms-muted">{w.name}</TD>
                    <TD><Badge tone={w.is_active ? 'success' : 'neutral'}>{w.is_active ? 'active' : 'inactive'}</Badge></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Card title="Recent Ledger Entries">
            {lastMovements.length === 0 ? (
              <EmptyState title="No ledger entries" message="Stock ledger activity will appear here." />
            ) : (
              <Table>
                <THead><TH>Type</TH><TH>Source</TH><TH className="text-right">Delta</TH><TH>When</TH></THead>
                <TBody>
                  {lastMovements.map((e, i) => (
                    <TR key={i}>
                      <TD className="font-medium">{e.entry_type}</TD>
                      <TD className="text-ecms-muted">{e.source_type}</TD>
                      <TD className="text-right">{num(e.quantity_delta)}</TD>
                      <TD>{date(e.occurred_at)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
