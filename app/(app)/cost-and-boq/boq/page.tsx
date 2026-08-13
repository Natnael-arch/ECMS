import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { IconListNumbers } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { money, num } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function BoqExplorerPage() {
  await requireAppUser();
  const { tenantId, projectId } = await getProjectContext();

  const [versions, progress, sections, items] = await Promise.all([
    db.boq_versions.findMany({
      where: { contracts: { project: { tenant_id: tenantId } } },
      orderBy: [{ status: 'asc' }, { version_number: 'desc' }],
      include: { contracts: { select: { contract_number: true } } },
    }),
    db.$queryRaw<Array<{ boq_item_id: string; item_number: string; description: string; unit: string | null; approved_quantity: number | null; rate: number | null; approved_amount: number; measured_quantity: number; certified_quantity: number; certified_amount: number; remaining_quantity: number | null }>>`
      SELECT boq_item_id, item_number, description, unit, approved_quantity, rate, approved_amount, measured_quantity, certified_quantity, certified_amount, remaining_quantity
      FROM ecms.v_boq_progress WHERE project_id = ${projectId ?? ''}`,
    db.boq_sections.findMany({ where: { boq_versions: { contracts: { project: { tenant_id: tenantId } } } }, orderBy: { sort_order: 'asc' } }),
    db.boq_items.count({ where: { boq_versions: { contracts: { project: { tenant_id: tenantId } } } } }),
  ]);

  const totalApproved = progress.reduce((s, r) => s + Number(r.approved_amount), 0);
  const totalCertified = progress.reduce((s, r) => s + Number(r.certified_amount), 0);

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="BOQ Explorer" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5">
          <p className="text-sm text-ecms-muted">BOQ Versions</p>
          <p className="mt-1 text-2xl font-bold text-ecms-text">{versions.length}</p>
        </div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5">
          <p className="text-sm text-ecms-muted">Sections</p>
          <p className="mt-1 text-2xl font-bold text-ecms-text">{sections.length}</p>
        </div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5">
          <p className="text-sm text-ecms-muted">Priced Items</p>
          <p className="mt-1 text-2xl font-bold text-ecms-text">{items}</p>
        </div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5">
          <p className="text-sm text-ecms-muted">Certified % of Approved</p>
          <p className="mt-1 text-2xl font-bold text-ecms-amber">{totalApproved > 0 ? num((totalCertified / totalApproved) * 100, 1) : '—'}%</p>
        </div>
      </div>

      <Card title="Approved BOQ Versions" icon={<IconListNumbers size={18} />}>
        {versions.length === 0 ? (
          <EmptyState title="No BOQ versions" message="Approved BOQ versions appear here once imported or created." />
        ) : (
          <Table>
            <THead><TH>Contract</TH><TH>Version</TH><TH>Name</TH><TH>Status</TH><TH className="text-right">Priced Items</TH><TH className="text-right">Grand Total</TH></THead>
            <TBody>
              {versions.map((v) => (
                <TR key={v.id} className="hover:bg-ecms-elevated/40">
                  <TD className="font-medium">{v.contracts.contract_number}</TD>
                  <TD>v{v.version_number}</TD>
                  <TD className="text-ecms-muted">{v.name}</TD>
                  <TD><span className="text-xs font-semibold uppercase">{v.status}</span></TD>
                  <TD className="text-right">{money(Number(v.priced_items_total))}</TD>
                  <TD className="text-right font-medium">{money(Number(v.grand_total))}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card title="Item Progress" subtitle="Measured vs certified against approved quantities">
        {progress.length === 0 ? (
          <EmptyState title="No BOQ items" message="Item progress will appear once a BOQ is approved and measurements are made." />
        ) : (
          <Table>
            <THead><TH>Item</TH><TH>Description</TH><TH>Unit</TH><TH className="text-right">Approved Qty</TH><TH className="text-right">Measured</TH><TH className="text-right">Certified</TH><TH>Progress</TH><TH className="text-right">Approved Amount</TH><TH className="text-right">Certified Amount</TH></THead>
            <TBody>
              {progress.map((r) => {
                const pct = Number(r.approved_quantity) > 0 ? Math.min(100, Math.round((Number(r.certified_quantity) / Number(r.approved_quantity)) * 100)) : 0;
                return (
                  <TR key={r.boq_item_id} className="hover:bg-ecms-elevated/40">
                    <TD className="font-medium whitespace-nowrap">{r.item_number}</TD>
                    <TD className="max-w-[280px] truncate">{r.description}</TD>
                    <TD className="text-ecms-muted">{r.unit ?? '—'}</TD>
                    <TD className="text-right">{num(r.approved_quantity)}</TD>
                    <TD className="text-right">{num(r.measured_quantity)}</TD>
                    <TD className="text-right">{num(r.certified_quantity)}</TD>
                    <TD className="min-w-[140px]"><ProgressBar progress={pct} showLabel={false} /></TD>
                    <TD className="text-right">{money(Number(r.approved_amount))}</TD>
                    <TD className="text-right">{money(Number(r.certified_amount))}</TD>
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
