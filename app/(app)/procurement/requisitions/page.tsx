import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { IconPlus, IconShoppingCart } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { money, date } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function RequisitionsPage() {
  const ctx = await requireAppUser();
  const { tenantId, projectId } = await getProjectContext();

  const [reqs, costCodes, workPackages] = await Promise.all([
    db.purchase_requisitions.findMany({
      where: projectId ? { project_id: projectId } : { project: { tenant_id: tenantId } },
      orderBy: { created_at: 'desc' },
      include: {
        purchase_requisition_lines: { select: { line_number: true, description: true, requested_quantity: true, unit: true, estimated_amount: true } },
        work_packages: { select: { package_code: true } },
        app_users_purchase_requisitions_requested_byToapp_users: { select: { display_name: true } },
      },
    }),
    db.cost_codes.findMany({ where: projectId ? { project_id: projectId } : { project: { tenant_id: tenantId } }, select: { id: true, cost_code: true } }),
    db.work_packages.findMany({ where: projectId ? { project_id: projectId } : { project: { tenant_id: tenantId } }, select: { id: true, package_code: true } }),
  ]);

  const nextNumber = reqs.length + 1;

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Purchase Requisitions" />

      <Card title="New Requisition" icon={<IconShoppingCart size={18} />}>
        <form method="POST" action="/api/v1/requisitions" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input name="requisition_number" defaultValue={`PR-${String(nextNumber).padStart(3, '0')}`} className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" />
          <input name="purpose" required className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" placeholder="Purpose" />
          <input name="required_date" type="date" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" />
          <select name="work_package_id" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text">
            <option value="">Work package</option>
            {workPackages.map((w) => <option key={w.id} value={w.id}>{w.package_code}</option>)}
          </select>
          <select name="cost_code_id" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text">
            <option value="">Cost code</option>
            {costCodes.map((c) => <option key={c.id} value={c.id}>{c.cost_code}</option>)}
          </select>
          <div className="sm:col-span-2 lg:col-span-3 flex items-end gap-2">
            <input name="line_desc" className="flex-1 rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" placeholder="Line description" />
            <input name="line_qty" type="number" step="0.001" className="w-28 rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" placeholder="Qty" />
            <input name="line_unit" className="w-20 rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" placeholder="Unit" />
            <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-ecms-amber px-3 py-1.5 text-sm font-semibold text-ecms-navy hover:bg-ecms-amber/90">
              <IconPlus size={16} /> Create
            </button>
          </div>
        </form>
      </Card>

      <Card>
        {reqs.length === 0 ? (
          <EmptyState title="No requisitions" message="Purchase requisitions raised by the project team appear here." />
        ) : (
          <Table>
            <THead><TH>Number</TH><TH>Purpose</TH><TH>Package</TH><TH>Requested By</TH><TH>Required</TH><TH>Status</TH><TH className="text-right">Est. Total</TH><TH>Lines</TH></THead>
            <TBody>
              {reqs.map((r) => {
                const total = r.purchase_requisition_lines.reduce((s, l) => s + Number(l.estimated_amount ?? 0), 0);
                return (
                  <TR key={r.id} className="hover:bg-ecms-elevated/40">
                    <TD className="font-medium">{r.requisition_number}</TD>
                    <TD className="max-w-[260px] truncate">{r.purpose}</TD>
                    <TD className="text-ecms-muted">{r.work_packages?.package_code ?? '—'}</TD>
                    <TD className="text-ecms-muted">{r.app_users_purchase_requisitions_requested_byToapp_users?.display_name}</TD>
                    <TD>{date(r.required_date)}</TD>
                    <TD><StatusPill status={r.status} /></TD>
                    <TD className="text-right font-medium">{money(total)}</TD>
                    <TD>{r.purchase_requisition_lines.length}</TD>
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
