import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { IconListNumbers } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { money, num } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function BoqContractPage({ params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params;
  await requireAppUser();
  const { tenantId, projectId } = await getProjectContext();

  const contract = await db.contracts.findUnique({ where: { id: contractId } });
  if (!contract) notFound();

  const boqVersion = await db.boq_versions.findFirst({
    where: { contract_id: contractId, status: { in: ['draft', 'approved'] } },
    include: {
      boq_sections: {
        where: { parent_id: null },
        orderBy: { sort_order: 'asc' },
        include: {
          boq_items: { orderBy: { sort_order: 'asc' } },
        },
      },
      boq_items: {
        where: { section_id: null },
        orderBy: { sort_order: 'asc' },
      },
    },
  });

  if (!boqVersion) notFound();

  const childSections = await db.boq_sections.findMany({
    where: { boq_version_id: boqVersion.id, parent_id: { not: null } },
    orderBy: { sort_order: 'asc' },
    include: { boq_items: { orderBy: { sort_order: 'asc' } } },
  });
  const childSectionsByParent = new Map(childSections.map((s) => [s.parent_id, s]));

  const allItems = await db.boq_items.findMany({
    where: { boq_version_id: boqVersion.id },
  });

  const progressRows = await db.$queryRaw<Array<{
    boq_item_id: string;
    item_number: string;
    description: string;
    unit: string | null;
    approved_quantity: number | null;
    rate: number | null;
    approved_amount: number;
    measured_quantity: number;
    certified_quantity: number;
    certified_amount: number;
  }>>`
    SELECT boq_item_id, item_number, description, unit, approved_quantity, rate, approved_amount, measured_quantity, certified_quantity, certified_amount
    FROM ecms.v_boq_progress WHERE project_id = ${projectId ?? ''}
  `;

  const progressMap = new Map(progressRows.map((r) => [r.boq_item_id, r]));
  const totalApproved = allItems.reduce((s, i) => s + Number(i.approved_amount), 0);
  const totalMeasured = progressRows.reduce((s, r) => s + Number(r.measured_quantity), 0);
  const totalCertified = progressRows.reduce((s, r) => s + Number(r.certified_quantity), 0);

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={`BOQ · ${contract.contract_number}`} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5">
          <p className="text-sm text-ecms-muted">Contract</p>
          <p className="mt-1 text-lg font-bold text-ecms-text">{contract.contract_number}</p>
          <p className="text-xs text-ecms-muted truncate">{contract.title}</p>
        </div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5">
          <p className="text-sm text-ecms-muted">Items</p>
          <p className="mt-1 text-2xl font-bold text-ecms-text">{allItems.length}</p>
        </div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5">
          <p className="text-sm text-ecms-muted">BOQ Total</p>
          <p className="mt-1 text-2xl font-bold text-ecms-amber">{money(Number(boqVersion.grand_total), boqVersion.currency)}</p>
        </div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5">
          <p className="text-sm text-ecms-muted">Certified %</p>
          <p className="mt-1 text-2xl font-bold text-ecms-text">{totalApproved > 0 ? num((totalCertified / totalApproved) * 100, 1) : '—'}%</p>
        </div>
      </div>

      {boqVersion.boq_sections.length > 0 ? (
        boqVersion.boq_sections.map((section) => (
          <Card key={section.id} title={`${section.section_code} · ${section.title}`}>
            {section.boq_items.length === 0 && !childSectionsByParent.has(section.id) ? (
              <EmptyState title="Empty section" message="This section has no items yet." />
            ) : (
              <div className="flex flex-col gap-4">
                {section.boq_items.length > 0 && (
                  <Table>
                    <THead><TH>Item</TH><TH>Description</TH><TH>Type</TH><TH>Unit</TH><TH className="text-right">Approved Qty</TH><TH className="text-right">Rate</TH><TH className="text-right">Amount</TH><TH>Progress</TH></THead>
                    <TBody>
                      {section.boq_items.map((item) => {
                        const p = progressMap.get(item.id);
                        const pct = Number(item.approved_quantity) > 0 && p ? Math.min(100, Math.round((Number(p.certified_quantity) / Number(item.approved_quantity)) * 100)) : 0;
                        return (
                          <TR key={item.id} className="hover:bg-ecms-elevated/40">
                            <TD className="font-medium whitespace-nowrap">{item.item_number}</TD>
                            <TD className="max-w-[280px] truncate">{item.description}</TD>
                            <TD className="text-ecms-muted">{item.item_type}</TD>
                            <TD className="text-ecms-muted">{item.unit ?? '—'}</TD>
                            <TD className="text-right">{num(Number(item.approved_quantity))}</TD>
                            <TD className="text-right">{item.rate != null ? money(Number(item.rate), boqVersion.currency) : '—'}</TD>
                            <TD className="text-right font-medium">{money(Number(item.approved_amount), boqVersion.currency)}</TD>
                            <TD className="min-w-[100px]"><ProgressBar progress={pct} showLabel={false} /></TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>
                )}
                {childSectionsByParent.has(section.id) && (() => {
                  const sub = childSectionsByParent.get(section.id)!;
                  return (
                    <div key={sub.id} className="ml-4">
                      <h4 className="text-sm font-semibold text-ecms-text mb-2">{sub.section_code} · {sub.title}</h4>
                      <Table>
                        <THead><TH>Item</TH><TH>Description</TH><TH>Unit</TH><TH className="text-right">Approved Qty</TH><TH className="text-right">Rate</TH><TH className="text-right">Amount</TH><TH>Progress</TH></THead>
                        <TBody>
                          {sub.boq_items.map((item) => {
                            const p = progressMap.get(item.id);
                            const pct = Number(item.approved_quantity) > 0 && p ? Math.min(100, Math.round((Number(p.certified_quantity) / Number(item.approved_quantity)) * 100)) : 0;
                            return (
                              <TR key={item.id} className="hover:bg-ecms-elevated/40">
                                <TD className="font-medium whitespace-nowrap">{item.item_number}</TD>
                                <TD className="max-w-[280px] truncate">{item.description}</TD>
                                <TD className="text-ecms-muted">{item.unit ?? '—'}</TD>
                                <TD className="text-right">{num(Number(item.approved_quantity))}</TD>
                                <TD className="text-right">{item.rate != null ? money(Number(item.rate), boqVersion.currency) : '—'}</TD>
                                <TD className="text-right font-medium">{money(Number(item.approved_amount), boqVersion.currency)}</TD>
                                <TD className="min-w-[100px]"><ProgressBar progress={pct} showLabel={false} /></TD>
                              </TR>
                            );
                          })}
                        </TBody>
                      </Table>
                    </div>
                  );
                })()}
              </div>
            )}
          </Card>
        ))
      ) : (
        <Card icon={<IconListNumbers size={18} />}>
          <EmptyState title="No BOQ sections" message="BOQ items are organized into sections. Import or create a BOQ to get started." />
        </Card>
      )}

      {boqVersion.boq_items.length > 0 && (
        <Card title="Unsectioned Items">
          <Table>
            <THead><TH>Item</TH><TH>Description</TH><TH>Unit</TH><TH className="text-right">Approved Qty</TH><TH className="text-right">Rate</TH><TH className="text-right">Amount</TH><TH>Progress</TH></THead>
            <TBody>
              {boqVersion.boq_items.map((item) => {
                const p = progressMap.get(item.id);
                const pct = Number(item.approved_quantity) > 0 && p ? Math.min(100, Math.round((Number(p.certified_quantity) / Number(item.approved_quantity)) * 100)) : 0;
                return (
                  <TR key={item.id} className="hover:bg-ecms-elevated/40">
                    <TD className="font-medium whitespace-nowrap">{item.item_number}</TD>
                    <TD className="max-w-[280px] truncate">{item.description}</TD>
                    <TD className="text-ecms-muted">{item.unit ?? '—'}</TD>
                    <TD className="text-right">{num(Number(item.approved_quantity))}</TD>
                    <TD className="text-right">{item.rate != null ? money(Number(item.rate), boqVersion.currency) : '—'}</TD>
                    <TD className="text-right font-medium">{money(Number(item.approved_amount), boqVersion.currency)}</TD>
                    <TD className="min-w-[100px]"><ProgressBar progress={pct} showLabel={false} /></TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}

      {boqVersion.status === 'draft' && (
      <Card title="Add BOQ Item">
        <form method="POST" action={`/api/v1/boq-versions/${boqVersion.id}/items`} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input name="item_number" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" placeholder="Item number" required />
          <input name="description" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" placeholder="Description" required />
          <input name="unit" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" placeholder="Unit (e.g. m, m², kg)" />
          <input name="quantity" type="number" step="0.01" min="0" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" placeholder="Quantity" />
          <input name="unit_rate" type="number" step="0.01" min="0" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" placeholder="Rate" />
          <input type="hidden" name="contractId" value={contractId} />
          <select name="section_id" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text">
            <option value="">No section (unsectioned)</option>
            {boqVersion.boq_sections.map((s) => (
              <option key={s.id} value={s.id}>{s.section_code} · {s.title}</option>
            ))}
          </select>
          <div className="sm:col-span-2 flex items-end">
            <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-ecms-amber px-3 py-1.5 text-sm font-semibold text-ecms-navy hover:bg-ecms-amber/90">
              Add Item
            </button>
          </div>
        </form>
      </Card>
      )}
    </div>
  );
}
