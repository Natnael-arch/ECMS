import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { IconPlus, IconTags } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { date, num } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function MaterialIssuesPage() {
  const ctx = await requireAppUser();
  const { tenantId, projectId } = await getProjectContext();

  const [issues, warehouses, workPackages] = await Promise.all([
    db.material_issues.findMany({
      where: projectId ? { project_id: projectId } : { project: { tenant_id: tenantId } },
      orderBy: { issue_date: 'desc' },
      include: {
        warehouses: { select: { warehouse_code: true } },
        work_packages: { select: { package_code: true } },
        material_issue_lines: { select: { line_number: true, inventory_item_id: true, requested_quantity: true, approved_quantity: true, issued_quantity: true, inventory_items: { select: { item_code: true, description: true } } } },
      },
    }),
    db.warehouses.findMany({ where: projectId ? { project_id: projectId } : { project: { tenant_id: tenantId } }, select: { id: true, warehouse_code: true } }),
    db.work_packages.findMany({ where: projectId ? { project_id: projectId } : { project: { tenant_id: tenantId } }, select: { id: true, package_code: true } }),
  ]);

  const nextNumber = issues.length + 1;

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Material Issues" />

      <Card title="New Material Issue" icon={<IconTags size={18} />}>
        <form method="POST" action="/api/v1/material-issues" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input name="issue_number" defaultValue={`MI-${String(nextNumber).padStart(3, '0')}`} className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" />
          <input name="issue_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" />
          <select name="warehouse_id" required className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text">
            <option value="">Warehouse…</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.warehouse_code}</option>)}
          </select>
          <select name="work_package_id" required className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text">
            <option value="">Work package…</option>
            {workPackages.map((w) => <option key={w.id} value={w.id}>{w.package_code}</option>)}
          </select>
          <input name="purpose" required className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" placeholder="Purpose" />
          <div className="sm:col-span-2 lg:col-span-5 flex items-center gap-2">
            <input name="recipient_name" className="flex-1 rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" placeholder="Recipient name" />
            <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-ecms-amber px-3 py-1.5 text-sm font-semibold text-ecms-navy hover:bg-ecms-amber/90">
              <IconPlus size={16} /> Create Draft
            </button>
          </div>
        </form>
      </Card>

      <Card>
        {issues.length === 0 ? (
          <EmptyState title="No material issues" message="Material issue vouchers against the warehouse appear here." />
        ) : (
          <Table>
            <THead><TH>Number</TH><TH>Date</TH><TH>Warehouse</TH><TH>Package</TH><TH>Purpose</TH><TH>Recipient</TH><TH>Status</TH><TH className="text-right">Issued Qty</TH><TH>Lines</TH></THead>
            <TBody>
              {issues.map((mi) => {
                const qty = mi.material_issue_lines.reduce((s, l) => s + Number(l.issued_quantity), 0);
                return (
                  <TR key={mi.id} className="hover:bg-ecms-elevated/40">
                    <TD className="font-medium">{mi.issue_number}</TD>
                    <TD>{date(mi.issue_date)}</TD>
                    <TD className="text-ecms-muted">{mi.warehouses.warehouse_code}</TD>
                    <TD className="text-ecms-muted">{mi.work_packages.package_code}</TD>
                    <TD className="max-w-[220px] truncate">{mi.purpose}</TD>
                    <TD className="text-ecms-muted">{mi.recipient_name ?? '—'}</TD>
                    <TD><StatusPill status={mi.status} /></TD>
                    <TD className="text-right font-medium">{num(qty)}</TD>
                    <TD>{mi.material_issue_lines.length}</TD>
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
