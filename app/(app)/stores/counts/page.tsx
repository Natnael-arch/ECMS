import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { IconClipboardList } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { date } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function StockCountsPage() {
  await requireAppUser();
  const { tenantId, projectId } = await getProjectContext();

  const counts = await db.stock_counts.findMany({
    where: projectId ? { project_id: projectId } : { projects: { tenant_id: tenantId } },
    orderBy: { count_date: 'desc' },
    include: {
      warehouses: { select: { warehouse_code: true } },
      stock_count_lines: { select: { system_quantity: true, counted_quantity: true, variance_quantity: true, inventory_items: { select: { item_code: true } } } },
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Stock Counts" />
      <Card icon={<IconClipboardList size={18} />}>
        {counts.length === 0 ? (
          <EmptyState title="No stock counts" message="Periodic stock count sheets appear here." />
        ) : (
          <Table>
            <THead><TH>Count</TH><TH>Warehouse</TH><TH>Date</TH><TH>Status</TH><TH className="text-right">Items Counted</TH><TH className="text-right">Variance Lines</TH></THead>
            <TBody>
              {counts.map((c) => {
                const varianceLines = c.stock_count_lines.filter((l) => Number(l.variance_quantity) !== 0).length;
                return (
                  <TR key={c.id} className="hover:bg-ecms-elevated/40">
                    <TD className="font-medium"><Link href={`/stores/counts/${c.id}`} className="hover:underline">{c.count_number}</Link></TD>
                    <TD className="text-ecms-muted">{c.warehouses.warehouse_code}</TD>
                    <TD>{date(c.count_date)}</TD>
                    <TD><StatusPill status={c.status} /></TD>
                    <TD className="text-right">{c.stock_count_lines.length}</TD>
                    <TD className="text-right">{varianceLines}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
