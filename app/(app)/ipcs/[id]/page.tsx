import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Badge } from '@/components/ui/Badge';
import { IconFileInvoice } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { money, date } from '@/lib/format';

export const dynamic = 'force-dynamic';

const transitions: Record<string, string[]> = {
  draft: ['submitted'],
  submitted: ['under_review', 'returned'],
  under_review: ['recommended', 'returned'],
  returned: ['submitted', 'cancelled'],
  recommended: ['certified', 'returned'],
  certified: ['paid'],
  cancelled: [],
};

export default async function IpcDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAppUser();

  const ipc = await db.ipc_certificates.findUnique({
    where: { id },
    include: {
      contracts: { select: { contract_number: true, title: true } },
      projects: { select: { project_code: true } },
      boq_versions: { select: { version_number: true, name: true } },
      ipc_lines: {
        orderBy: { line_number: 'asc' },
        include: { boq_items: { select: { item_number: true, description: true, unit: true } } },
      },
      ipc_adjustments: { orderBy: { line_number: 'asc' }, include: { contract_clauses: { select: { clause_number: true, title: true } } } },
      ipc_materials_on_site: { orderBy: { line_number: 'asc' } },
      payments: { orderBy: { payment_date: 'asc' } },
    },
  });

  if (!ipc) notFound();

  const nextStatuses = transitions[ipc.status] ?? [];
  const totals = ipc.ipc_lines.reduce((acc, l) => {
    acc.previous += Number(l.previous_amount);
    acc.current += Number(l.current_amount);
    acc.cumulative += Number(l.cumulative_amount);
    return acc;
  }, { previous: 0, current: 0, cumulative: 0 });

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title={`IPC ${ipc.ipc_number} · ${ipc.contracts.contract_number}`}
        actions={
          nextStatuses.length > 0 ? (
            <form method="POST" action={`/api/v1/ipcs/${ipc.id}`}>
              <input type="hidden" name="status" value={nextStatuses[0]} />
              <button type="submit" className="rounded-lg bg-ecms-amber px-4 py-2 text-sm font-semibold text-ecms-navy hover:bg-ecms-amber/90">
                Move to {nextStatuses[0].replace('_', ' ')}
              </button>
            </form>
          ) : (
            <StatusPill status={ipc.status} />
          )
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card title="Certificate Summary" icon={<IconFileInvoice size={18} />}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-ecms-muted">Contract</dt><dd className="font-medium">{ipc.contracts.contract_number}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Project</dt><dd className="font-medium">{ipc.projects.project_code}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">BOQ version</dt><dd className="font-medium">v{ipc.boq_versions.version_number}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Status</dt><dd><StatusPill status={ipc.status} /></dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Period</dt><dd className="font-medium whitespace-nowrap">{date(ipc.period_start)} – {date(ipc.period_end)}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Currency</dt><dd className="font-medium">{ipc.currency}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Certified at</dt><dd className="font-medium">{date(ipc.certified_at)}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Paid at</dt><dd className="font-medium">{date(ipc.paid_at)}</dd></div>
          </dl>
        </Card>

        <Card title="Amounts" bodyClassName="pt-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-ecms-muted">Previous work</dt><dd className="font-medium">{money(Number(ipc.previous_work_amount), ipc.currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Current work</dt><dd className="font-medium">{money(Number(ipc.current_work_amount), ipc.currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">MOS current</dt><dd className="font-medium">{money(Number(ipc.current_mos_amount), ipc.currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Additions</dt><dd className="font-medium text-ecms-success">{money(Number(ipc.current_additions), ipc.currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Deductions</dt><dd className="font-medium text-ecms-danger">{money(Number(ipc.current_deductions), ipc.currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Retention</dt><dd className="font-medium">{money(Number(ipc.current_retention), ipc.currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Advance recovery</dt><dd className="font-medium">{money(Number(ipc.current_advance_recovery), ipc.currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Withholding tax</dt><dd className="font-medium">{money(Number(ipc.current_withholding_tax), ipc.currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">VAT</dt><dd className="font-medium">{money(Number(ipc.current_vat), ipc.currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Price adjustment</dt><dd className="font-medium">{money(Number(ipc.current_price_adjustment), ipc.currency)}</dd></div>
            <div className="flex justify-between border-t border-ecms-border pt-2"><dt className="text-ecms-muted font-semibold">Net current</dt><dd className="font-bold text-ecms-amber">{money(Number(ipc.net_current_amount), ipc.currency)}</dd></div>
            <div className="flex justify-between border-t border-ecms-border pt-2"><dt className="text-ecms-muted font-semibold">Net cumulative</dt><dd className="font-bold">{money(Number(ipc.cumulative_net_amount), ipc.currency)}</dd></div>
          </dl>
        </Card>

        <Card title="Certification Trail" bodyClassName="pt-3">
          <ul className="space-y-3 text-sm">
            {[
              ['Submitted', ipc.submitted_at, ipc.submitted_by],
              ['Recommended', ipc.recommended_at, ipc.recommended_by],
              ['Certified', ipc.certified_at, ipc.certified_by],
              ['Locked', ipc.locked_at, null],
              ['Paid', ipc.paid_at, null],
            ].map(([label, when, who]) => (
              <li key={String(label)} className="flex items-center justify-between gap-2">
                <span className="text-ecms-muted">{String(label)}</span>
                <span className="font-medium">{when ? date(when as Date) : '—'}</span>
              </li>
            ))}
          </ul>
          {ipc.notes && <p className="mt-3 rounded-lg bg-ecms-elevated/50 p-3 text-xs text-ecms-muted">{ipc.notes}</p>}
        </Card>
      </div>

      <Card title="IPC Lines" subtitle={`${totals.current.toLocaleString()} this period · ${totals.cumulative.toLocaleString()} cumulative`}>
        {ipc.ipc_lines.length === 0 ? (
          <EmptyState title="No IPC lines" message="Lines are generated from approved BOQ items with measurements." />
        ) : (
          <Table>
            <THead><TH>#</TH><TH>Item</TH><TH>Description</TH><TH>Unit</TH><TH className="text-right">Rate</TH><TH className="text-right">Current Qty</TH><TH className="text-right">Cumulative Qty</TH><TH className="text-right">Previous Amount</TH><TH className="text-right">Current Amount</TH></THead>
            <TBody>
              {ipc.ipc_lines.map((l) => (
                <TR key={l.id} className="hover:bg-ecms-elevated/40">
                  <TD>{l.line_number}</TD>
                  <TD className="font-medium whitespace-nowrap">{l.item_number_snapshot}</TD>
                  <TD className="max-w-[260px] truncate text-ecms-muted">{l.description_snapshot}</TD>
                  <TD>{l.unit_snapshot ?? '—'}</TD>
                  <TD className="text-right">{money(Number(l.rate_snapshot), ipc.currency)}</TD>
                  <TD className="text-right">{Number(l.current_quantity)}</TD>
                  <TD className="text-right">{Number(l.cumulative_quantity)}</TD>
                  <TD className="text-right">{money(Number(l.previous_amount), ipc.currency)}</TD>
                  <TD className="text-right font-medium">{money(Number(l.current_amount), ipc.currency)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card title="Adjustments">
          {ipc.ipc_adjustments.length === 0 ? (
            <EmptyState title="No adjustments" message="Retention, tax and other adjustments applied to this certificate appear here." />
          ) : (
            <Table>
              <THead><TH>#</TH><TH>Kind</TH><TH>Description</TH><TH className="text-right">Amount</TH></THead>
              <TBody>
                {ipc.ipc_adjustments.map((a) => (
                  <TR key={a.id}>
                    <TD>{a.line_number}</TD>
                    <TD><Badge tone={Number(a.direction) > 0 ? 'success' : 'danger'}>{a.kind}</Badge></TD>
                    <TD className="text-ecms-muted">{a.description}</TD>
                    <TD className="text-right font-medium">{money(Number(a.current_amount), ipc.currency)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card title="Payments">
          {ipc.payments.length === 0 ? (
            <EmptyState title="No payments" message="Payments recorded against this certificate appear here." />
          ) : (
            <Table>
              <THead><TH>Reference</TH><TH>Date</TH><TH className="text-right">Gross</TH><TH className="text-right">Withholding</TH><TH className="text-right">Net Paid</TH></THead>
              <TBody>
                {ipc.payments.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-medium">{p.payment_reference}</TD>
                    <TD>{date(p.payment_date)}</TD>
                    <TD className="text-right">{money(Number(p.gross_paid_amount), p.currency)}</TD>
                    <TD className="text-right">{money(Number(p.withholding_amount), p.currency)}</TD>
                    <TD className="text-right font-medium">{money(Number(p.net_paid_amount), p.currency)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      <Card title="Materials on Site">
        {ipc.ipc_materials_on_site.length === 0 ? (
          <EmptyState title="No materials on site" message="Eligible materials brought to site for this certificate appear here." />
        ) : (
          <Table>
            <THead><TH>#</TH><TH>Description</TH><TH>Invoice</TH><TH className="text-right">Gross Value</TH><TH className="text-right">Eligible</TH><TH className="text-right">Current Credit</TH></THead>
            <TBody>
              {ipc.ipc_materials_on_site.map((m) => (
                <TR key={m.id}>
                  <TD>{m.line_number}</TD>
                  <TD className="text-ecms-muted">{m.description}</TD>
                  <TD>{m.invoice_number ?? '—'}</TD>
                  <TD className="text-right">{money(Number(m.gross_value), ipc.currency)}</TD>
                  <TD className="text-right">{money(Number(m.eligible_value), ipc.currency)}</TD>
                  <TD className="text-right font-medium">{money(Number(m.current_credit), ipc.currency)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
