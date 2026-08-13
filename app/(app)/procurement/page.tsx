import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { IconPlus, IconTruck } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { date } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function SuppliersPage() {
  const ctx = await requireAppUser();
  const { tenantId } = await getProjectContext();

  const suppliers = await db.suppliers.findMany({
    where: { tenant_id: tenantId },
    orderBy: { supplier_code: 'asc' },
    include: {
      organizations: { select: { legal_name: true, short_name: true, email: true, phone: true } },
      _count: { select: { purchase_orders: true } },
    },
  });

  const orgs = await db.organizations.findMany({ where: { tenant_id: tenantId }, select: { id: true, legal_name: true }, orderBy: { legal_name: 'asc' } });

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Supplier Register" />

      <Card title="Register Supplier" icon={<IconTruck size={18} />}>
        <form method="POST" action="/api/v1/suppliers" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <select name="organization_id" required className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text">
            <option value="">Organization…</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.legal_name}</option>)}
          </select>
          <input name="supplier_code" required className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" placeholder="Supplier code" />
          <input name="categories" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" placeholder="Categories (comma-separated)" />
          <input name="tax_clearance_expiry" type="date" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" />
          <button type="submit" className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-ecms-amber px-3 py-1.5 text-sm font-semibold text-ecms-navy hover:bg-ecms-amber/90">
            <IconPlus size={16} /> Register
          </button>
        </form>
      </Card>

      <Card>
        {suppliers.length === 0 ? (
          <EmptyState title="No suppliers" message="Register suppliers to begin procurement." />
        ) : (
          <Table>
            <THead><TH>Code</TH><TH>Legal Name</TH><TH>Categories</TH><TH>Contact</TH><TH>Status</TH><TH>Tax Clearance</TH><TH>Orders</TH></THead>
            <TBody>
              {suppliers.map((s) => (
                <TR key={s.id} className="hover:bg-ecms-elevated/40">
                  <TD className="font-medium">{s.supplier_code}</TD>
                  <TD>{s.organizations.legal_name}</TD>
                  <TD className="text-ecms-muted">{(s.categories ?? []).join(', ') || '—'}</TD>
                  <TD className="text-ecms-muted">{s.organizations.email ?? s.organizations.phone ?? '—'}</TD>
                  <TD><StatusPill status={s.status} /></TD>
                  <TD>{date(s.tax_clearance_expiry)}</TD>
                  <TD>{s._count.purchase_orders}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
