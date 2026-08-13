import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { IconAdjustments } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { money, date } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function VariationsPage() {
  await requireAppUser();
  const { tenantId, projectId } = await getProjectContext();

  const variations = await db.variations.findMany({
    where: projectId ? { project_id: projectId } : { project: { tenant_id: tenantId } },
    orderBy: { created_at: 'desc' },
    include: {
      contracts: { select: { contract_number: true } },
      variation_items: { select: { line_number: true, change_type: true, description: true, amount: true } },
    },
  });

  const totals = {
    submitted: 0,
    approved: 0,
    incorporated: 0,
  };
  for (const v of variations) {
    if (v.status === 'approved') totals.approved += Number(v.approved_value);
    if (v.status === 'incorporated') totals.incorporated += Number(v.approved_value);
    if (['submitted', 'under_review'].includes(v.status)) totals.submitted += Number(v.approved_value);
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Variations" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5">
          <p className="text-sm text-ecms-muted">Pending Review Value</p>
          <p className="mt-1 text-2xl font-bold text-ecms-warning">{money(totals.submitted)}</p>
        </div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5">
          <p className="text-sm text-ecms-muted">Approved Value</p>
          <p className="mt-1 text-2xl font-bold text-ecms-text">{money(totals.approved)}</p>
        </div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5">
          <p className="text-sm text-ecms-muted">Incorporated into BOQ</p>
          <p className="mt-1 text-2xl font-bold text-ecms-success">{money(totals.incorporated)}</p>
        </div>
      </div>

      <Card title="Variation Register" icon={<IconAdjustments size={18} />}>
        {variations.length === 0 ? (
          <EmptyState title="No variations" message="Variation orders against contracts appear here." />
        ) : (
          <Table>
            <THead><TH>Number</TH><TH>Contract</TH><TH>Title</TH><TH>Status</TH><TH>Reason</TH><TH>Submitted</TH><TH className="text-right">Approved Value</TH><TH className="text-right">Time Impact</TH><TH>Lines</TH></THead>
            <TBody>
              {variations.map((v) => (
                <TR key={v.id} className="hover:bg-ecms-elevated/40">
                  <TD className="font-medium">{v.variation_number}</TD>
                  <TD className="text-ecms-muted">{v.contracts.contract_number}</TD>
                  <TD className="max-w-[260px] truncate">{v.title}</TD>
                  <TD><StatusPill status={v.status} /></TD>
                  <TD className="text-ecms-muted">{v.reason_code ?? '—'}</TD>
                  <TD>{date(v.submitted_at)}</TD>
                  <TD className="text-right font-medium">{money(Number(v.approved_value))}</TD>
                  <TD className="text-right">{v.time_impact_days > 0 ? `${v.time_impact_days} d` : '—'}</TD>
                  <TD className="text-ecms-muted">{v.variation_items.length}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
