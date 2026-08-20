import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { WorkflowStepper } from '@/components/ui/WorkflowStepper';
import { IconRuler } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { date, num } from '@/lib/format';

export const dynamic = 'force-dynamic';

const measurementSteps = [
  { key: 'draft', label: 'Draft' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'verified', label: 'Verified' },
  { key: 'returned', label: 'Returned' },
];

const transitions: Record<string, string[]> = {
  draft: ['submitted'],
  submitted: ['verified', 'returned'],
  verified: [],
  returned: ['draft', 'submitted'],
};

export default async function MeasurementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAppUser();
  const { projectId } = await getProjectContext();

  const measurement = await db.measurements.findUnique({
    where: { id },
    include: {
      contracts: { select: { contract_number: true, title: true } },
      work_packages: { select: { package_code: true } },
      organizations: { select: { short_name: true } },
      measurement_lines: {
        orderBy: { line_number: 'asc' },
        include: {
          boq_items: { select: { item_number: true, description: true, unit: true } },
          measurement_segments: { orderBy: { segment_number: 'asc' } },
        },
      },
      app_users_measurements_created_byToapp_users: { select: { display_name: true } },
      app_users_measurements_submitted_byToapp_users: { select: { display_name: true } },
      app_users_measurements_verified_byToapp_users: { select: { display_name: true } },
    },
  });

  if (!measurement) notFound();

  const nextStatuses = transitions[measurement.status] ?? [];
  const completedSteps = measurement.status === 'verified' ? ['draft', 'submitted', 'verified'] :
    measurement.status === 'submitted' ? ['draft', 'submitted'] :
    measurement.status === 'returned' ? ['draft'] : [];

  const totalSubmitted = measurement.measurement_lines.reduce((s, l) => s + Number(l.submitted_quantity), 0);
  const totalAccepted = measurement.measurement_lines.reduce((s, l) => s + Number(l.accepted_quantity ?? 0), 0);
  const totalAmount = measurement.measurement_lines.reduce((s, l) => s + Number(l.amount_snapshot ?? 0), 0);

  const nextAction = nextStatuses[0];
  const actionSubRoute: Record<string, string> = {
    submitted: 'submit',
    verified: 'verify',
    returned: 'return',
    draft: 'return',
  };
  const actionLabel: Record<string, string> = {
    submitted: 'Submit for Review',
    verified: 'Verify',
    returned: 'Return',
  };

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title={`Measurement ${measurement.measurement_number}`}
        actions={
          nextAction ? (
            <form method="POST" action={`/api/v1/measurements/${measurement.id}/${actionSubRoute[nextAction]}`}>
              <button type="submit" className="rounded-lg bg-ecms-amber px-4 py-2 text-sm font-semibold text-ecms-navy hover:bg-ecms-amber/90">
                {actionLabel[nextAction] ?? nextAction}
              </button>
            </form>
          ) : (
            <StatusPill status={measurement.status} />
          )
        }
      />

      <Card bodyClassName="pt-5 pb-6 px-6">
        <WorkflowStepper steps={measurementSteps} current={measurement.status} completedSteps={completedSteps} />
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card title="Measurement Info" icon={<IconRuler size={18} />}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-ecms-muted">Contract</dt><dd className="font-medium">{measurement.contracts.contract_number}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Date</dt><dd className="font-medium">{date(measurement.measurement_date)}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Package</dt><dd className="font-medium">{measurement.work_packages?.package_code ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Contractor</dt><dd className="font-medium">{measurement.organizations?.short_name ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Revision</dt><dd className="font-medium">v{measurement.revision_number}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Status</dt><dd><StatusPill status={measurement.status} /></dd></div>
          </dl>
        </Card>

        <Card title="Totals" bodyClassName="pt-3">
          <dl className="grid grid-cols-1 gap-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-ecms-muted">Lines</dt><dd className="font-bold text-lg text-ecms-text">{measurement.measurement_lines.length}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Submitted Qty</dt><dd className="font-medium">{num(totalSubmitted)}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Accepted Qty</dt><dd className="font-medium">{num(totalAccepted)}</dd></div>
            <div className="flex justify-between border-t border-ecms-border pt-2"><dt className="text-ecms-muted font-semibold">Total Amount</dt><dd className="font-bold text-ecms-amber">{num(totalAmount)}</dd></div>
          </dl>
        </Card>

        <Card title="Audit Trail" bodyClassName="pt-3">
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between gap-2">
              <span className="text-ecms-muted">Created by</span>
              <span className="font-medium">{measurement.app_users_measurements_created_byToapp_users?.display_name ?? '—'}</span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="text-ecms-muted">Submitted</span>
              <span className="font-medium">{measurement.submitted_at ? date(measurement.submitted_at) : '—'}</span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="text-ecms-muted">Submitted by</span>
              <span className="font-medium">{measurement.app_users_measurements_submitted_byToapp_users?.display_name ?? '—'}</span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="text-ecms-muted">Verified</span>
              <span className="font-medium">{measurement.verified_at ? date(measurement.verified_at) : '—'}</span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="text-ecms-muted">Verified by</span>
              <span className="font-medium">{measurement.app_users_measurements_verified_byToapp_users?.display_name ?? '—'}</span>
            </li>
            {measurement.returned_reason && (
              <li className="flex flex-col gap-1">
                <span className="text-ecms-muted">Return reason</span>
                <span className="rounded-lg bg-ecms-danger/10 p-2 text-xs text-ecms-danger">{measurement.returned_reason}</span>
              </li>
            )}
          </ul>
          {measurement.summary && <p className="mt-3 rounded-lg bg-ecms-elevated/50 p-3 text-xs text-ecms-muted">{measurement.summary}</p>}
        </Card>
      </div>

      <Card title="Measurement Lines" subtitle={`${measurement.measurement_lines.length} lines · ${num(totalSubmitted)} submitted qty`}>
        {measurement.measurement_lines.length === 0 ? (
          <EmptyState icon={<IconRuler size={28} />} title="No measurement lines" message="Add measurement lines to this sheet from the BOQ items." />
        ) : (
          <Table>
            <THead><TH>#</TH><TH>Item</TH><TH>Description</TH><TH>Unit</TH><TH className="text-right">Submitted Qty</TH><TH className="text-right">Accepted Qty</TH><TH className="text-right">Rate</TH><TH className="text-right">Amount</TH><TH>Remarks</TH></THead>
            <TBody>
              {measurement.measurement_lines.map((l) => (
                <TR key={l.id} className="hover:bg-ecms-elevated/40">
                  <TD>{l.line_number}</TD>
                  <TD className="font-medium whitespace-nowrap">{l.boq_items.item_number}</TD>
                  <TD className="max-w-[260px] truncate text-ecms-muted">{l.description ?? l.boq_items.description}</TD>
                  <TD className="text-ecms-muted">{l.unit}</TD>
                  <TD className="text-right">{num(Number(l.submitted_quantity))}</TD>
                  <TD className="text-right">{l.accepted_quantity != null ? num(Number(l.accepted_quantity)) : <span className="text-ecms-muted">—</span>}</TD>
                  <TD className="text-right">{num(Number(l.rate_snapshot))}</TD>
                  <TD className="text-right font-medium">{num(Number(l.amount_snapshot))}</TD>
                  <TD className="text-ecms-muted text-xs max-w-[160px] truncate">{l.remarks ?? '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {measurement.measurement_lines.some((l) => l.measurement_segments.length > 0) && (
        <Card title="Chainage Segments" subtitle="Location-based segments for measurement lines">
          <Table>
            <THead><TH>Line</TH><TH>Segment</TH><TH>Start Chainage</TH><TH>End Chainage</TH><TH className="text-right">Offset (m)</TH><TH className="text-right">Quantity</TH><TH>Notes</TH></THead>
            <TBody>
              {measurement.measurement_lines.flatMap((l) =>
                l.measurement_segments.map((s) => (
                  <TR key={s.id} className="hover:bg-ecms-elevated/40">
                    <TD className="font-medium">{l.boq_items.item_number}</TD>
                    <TD>{s.segment_number}</TD>
                    <TD>{s.start_chainage_mm != null ? `${(Number(s.start_chainage_mm) / 1000).toFixed(3)} km` : '—'}</TD>
                    <TD>{s.end_chainage_mm != null ? `${(Number(s.end_chainage_mm) / 1000).toFixed(3)} km` : '—'}</TD>
                    <TD className="text-right">{s.offset_m != null ? num(Number(s.offset_m)) : '—'}</TD>
                    <TD className="text-right">{s.quantity != null ? num(Number(s.quantity)) : '—'}</TD>
                    <TD className="text-ecms-muted text-xs max-w-[160px] truncate">{s.notes ?? '—'}</TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
