import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Badge } from '@/components/ui/Badge';
import { IconCash } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { money, num, date } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function PayrollPage() {
  await requireAppUser();
  const { tenantId, projectId } = await getProjectContext();

  const [batches, labor, workers, workerPayments] = await Promise.all([
    db.payroll_batches.findMany({
      where: projectId ? { project_id: projectId } : { project: { tenant_id: tenantId } },
      orderBy: { period_end: 'desc' },
      include: { _count: { select: { payroll_lines: true } } },
    }),
    db.$queryRaw<Array<{ work_package_id: string | null; package_code: string | null; cost_code: string | null; worker_id: string; worker_number: string; display_name: string; regular_hours: number; overtime_hours: number; approved_gross_amount: number }>>`
      SELECT work_package_id, package_code, cost_code, worker_id, worker_number, display_name, regular_hours, overtime_hours, approved_gross_amount
      FROM ecms.v_labor_cost_by_package WHERE project_id = ${projectId ?? ''}`,
    db.workers.count({ where: projectId ? { project_id: projectId } : { project: { tenant_id: tenantId } } }),
    db.$queryRaw<Array<{ payment_date: Date; amount: number }>>`
      SELECT payment_date, amount FROM ecms.worker_payments wp
      JOIN ecms.payroll_lines pl ON pl.id = wp.payroll_line_id
      JOIN ecms.payroll_batches pb ON pb.id = pl.payroll_batch_id
      WHERE pb.project_id = ${projectId ?? ''} ORDER BY wp.payment_date DESC`,
  ]);

  const totalGross = batches.reduce((s, b) => s + Number(b.gross_amount), 0);
  const totalNet = batches.reduce((s, b) => s + Number(b.net_amount), 0);
  const totalPaid = workerPayments.reduce((s, p) => s + Number(p.amount), 0);
  const laborGross = labor.reduce((s, r) => s + Number(r.approved_gross_amount), 0);

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Payroll" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5"><p className="text-sm text-ecms-muted">Payroll Batches</p><p className="mt-1 text-2xl font-bold text-ecms-text">{batches.length}</p></div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5"><p className="text-sm text-ecms-muted">Batch Gross</p><p className="mt-1 text-2xl font-bold text-ecms-text">{money(totalGross)}</p></div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5"><p className="text-sm text-ecms-muted">Batch Net</p><p className="mt-1 text-2xl font-bold text-ecms-amber">{money(totalNet)}</p></div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5"><p className="text-sm text-ecms-muted">Paid to Workers</p><p className="mt-1 text-2xl font-bold text-ecms-success">{money(totalPaid)}</p></div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card title="Payroll Batches" icon={<IconCash size={18} />}>
          {batches.length === 0 ? (
            <EmptyState title="No payroll batches" message="Calculated payroll batches appear here." />
          ) : (
            <Table>
              <THead><TH>Number</TH><TH>Period</TH><TH>Status</TH><TH className="text-right">Gross</TH><TH className="text-right">Deductions</TH><TH className="text-right">Net</TH><TH>Lines</TH></THead>
              <TBody>
                {batches.map((b) => (
                  <TR key={b.id} className="hover:bg-ecms-elevated/40">
                    <TD className="font-medium">{b.payroll_number}</TD>
                    <TD className="whitespace-nowrap">{date(b.period_start)} – {date(b.period_end)}</TD>
                    <TD><StatusPill status={b.status} /></TD>
                    <TD className="text-right">{money(Number(b.gross_amount), b.currency)}</TD>
                    <TD className="text-right">{money(Number(b.deduction_amount), b.currency)}</TD>
                    <TD className="text-right font-medium">{money(Number(b.net_amount), b.currency)}</TD>
                    <TD>{b._count.payroll_lines}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card title="Approved Labor Cost by Package" subtitle="From approved timesheets">
          {labor.length === 0 ? (
            <EmptyState title="No labor cost" message="Approved labor cost appears once timesheets are approved." />
          ) : (
            <Table>
              <THead><TH>Package</TH><TH>Cost Code</TH><TH>Worker</TH><TH className="text-right">Regular Hrs</TH><TH className="text-right">OT Hrs</TH><TH className="text-right">Gross</TH></THead>
              <TBody>
                {labor.map((r, i) => (
                  <TR key={i} className="hover:bg-ecms-elevated/40">
                    <TD className="text-ecms-muted">{r.package_code ?? '—'}</TD>
                    <TD className="text-ecms-muted">{r.cost_code ?? '—'}</TD>
                    <TD className="font-medium">{r.display_name} <span className="text-ecms-muted">({r.worker_number})</span></TD>
                    <TD className="text-right">{num(Number(r.regular_hours), 1)}</TD>
                    <TD className="text-right">{num(Number(r.overtime_hours), 1)}</TD>
                    <TD className="text-right font-medium">{money(Number(r.approved_gross_amount))}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      {totalGross > 0 && (
        <Card title="Summary" bodyClassName="pt-3">
          <div className="flex flex-wrap gap-6 text-sm">
            <div><span className="text-ecms-muted">Workers on roster: </span><Badge tone="neutral">{workers}</Badge></div>
            <div><span className="text-ecms-muted">Approved labor gross: </span><Badge tone="info">{money(laborGross)}</Badge></div>
            <div><span className="text-ecms-muted">Paid to workers: </span><Badge tone="success">{money(totalPaid)}</Badge></div>
          </div>
        </Card>
      )}
    </div>
  );
}
