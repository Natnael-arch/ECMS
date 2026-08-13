import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { IconReport } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { money, num, date } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  await requireAppUser();
  const { tenantId, projectId } = await getProjectContext();

  const [commercial, moneyStreams, exceptions, labor] = await Promise.all([
    db.$queryRaw<Array<{ contract_id: string; contract_number: string; currency: string; original_contract_amount: number; approved_variations: number; revised_contract_amount: number; certified_net: number; retention_held: number; paid_net: number; uncertified_balance: number }>>`
      SELECT contract_id, contract_number, currency, original_contract_amount, approved_variations, revised_contract_amount, certified_net, retention_held, paid_net, uncertified_balance
      FROM ecms.v_contract_commercial_position WHERE project_id = ${projectId ?? ''} ORDER BY contract_number ASC`,
    db.$queryRaw<Array<{ period_month: Date; employer_to_contractor_certified: number; contractor_to_supplier_paid: number; contractor_to_worker_paid: number }>>`
      SELECT period_month, employer_to_contractor_certified, contractor_to_supplier_paid, contractor_to_worker_paid
      FROM ecms.v_three_money_streams WHERE project_id = ${projectId ?? ''} ORDER BY period_month DESC LIMIT 12`,
    db.$queryRaw<Array<{ source_type: string; category: string; severity: string; status: string; title: string; age_days: number; created_at: Date }>>`
      SELECT source_type, category, severity, status, title, age_days, created_at
      FROM ecms.v_open_exceptions WHERE project_id = ${projectId ?? ''} ORDER BY created_at DESC LIMIT 50`,
    db.$queryRaw<Array<{ package_code: string | null; cost_code: string | null; regular_hours: number; overtime_hours: number; approved_gross_amount: number }>>`
      SELECT package_code, cost_code, sum(regular_hours) AS regular_hours, sum(overtime_hours) AS overtime_hours, sum(approved_gross_amount) AS approved_gross_amount
      FROM ecms.v_labor_cost_by_package WHERE project_id = ${projectId ?? ''} GROUP BY package_code, cost_code ORDER BY approved_gross_amount DESC`,
  ]);

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Report Centre" />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card title="Contract Commercial Position" icon={<IconReport size={18} />}>
          {commercial.length === 0 ? (
            <EmptyState title="No data" message="Contract commercial position report is empty." />
          ) : (
            <Table>
              <THead><TH>Contract</TH><TH className="text-right">Original</TH><TH className="text-right">Variations</TH><TH className="text-right">Revised</TH><TH className="text-right">Certified Net</TH><TH className="text-right">Retention</TH><TH className="text-right">Paid</TH><TH className="text-right">Uncertified</TH></THead>
              <TBody>
                {commercial.map((c) => (
                  <TR key={c.contract_id} className="hover:bg-ecms-elevated/40">
                    <TD className="font-medium">{c.contract_number}</TD>
                    <TD className="text-right">{money(Number(c.original_contract_amount), c.currency)}</TD>
                    <TD className="text-right">{money(Number(c.approved_variations), c.currency)}</TD>
                    <TD className="text-right font-medium">{money(Number(c.revised_contract_amount), c.currency)}</TD>
                    <TD className="text-right">{money(Number(c.certified_net), c.currency)}</TD>
                    <TD className="text-right">{money(Number(c.retention_held), c.currency)}</TD>
                    <TD className="text-right">{money(Number(c.paid_net), c.currency)}</TD>
                    <TD className="text-right font-medium">{money(Number(c.uncertified_balance), c.currency)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card title="Three Money Streams" subtitle="Monthly certified, supplier-paid and worker-paid amounts">
          {moneyStreams.length === 0 ? (
            <EmptyState title="No cash flow" message="Certified, supplier and worker payment streams will appear here." />
          ) : (
            <Table>
              <THead><TH>Month</TH><TH className="text-right">Employer → Contractor</TH><TH className="text-right">Contractor → Supplier</TH><TH className="text-right">Contractor → Worker</TH></THead>
              <TBody>
                {moneyStreams.map((m, i) => (
                  <TR key={i} className="hover:bg-ecms-elevated/40">
                    <TD className="font-medium">{date(m.period_month)}</TD>
                    <TD className="text-right">{money(Number(m.employer_to_contractor_certified))}</TD>
                    <TD className="text-right">{money(Number(m.contractor_to_supplier_paid))}</TD>
                    <TD className="text-right">{money(Number(m.contractor_to_worker_paid))}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card title="Open Exceptions" subtitle="Open issues and import exceptions">
          {exceptions.length === 0 ? (
            <EmptyState title="No open exceptions" message="All issues and import exceptions are resolved." />
          ) : (
            <Table>
              <THead><TH>Source</TH><TH>Category</TH><TH>Title</TH><TH>Severity</TH><TH>Status</TH><TH className="text-right">Age (days)</TH></THead>
              <TBody>
                {exceptions.map((e, i) => (
                  <TR key={i} className="hover:bg-ecms-elevated/40">
                    <TD className="text-ecms-muted">{e.source_type}</TD>
                    <TD className="text-ecms-muted">{e.category}</TD>
                    <TD className="max-w-[220px] truncate">{e.title}</TD>
                    <TD>{e.severity}</TD>
                    <TD><StatusPill status={e.status} /></TD>
                    <TD className="text-right">{num(Number(e.age_days), 1)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card title="Labor Cost by Package" subtitle="Approved gross cost grouped by package and cost code">
          {labor.length === 0 ? (
            <EmptyState title="No labor cost" message="Approved labor cost appears once timesheets are approved." />
          ) : (
            <Table>
              <THead><TH>Package</TH><TH>Cost Code</TH><TH className="text-right">Regular Hrs</TH><TH className="text-right">OT Hrs</TH><TH className="text-right">Gross</TH></THead>
              <TBody>
                {labor.map((l, i) => (
                  <TR key={i} className="hover:bg-ecms-elevated/40">
                    <TD className="text-ecms-muted">{l.package_code ?? '—'}</TD>
                    <TD className="text-ecms-muted">{l.cost_code ?? '—'}</TD>
                    <TD className="text-right">{num(Number(l.regular_hours), 1)}</TD>
                    <TD className="text-right">{num(Number(l.overtime_hours), 1)}</TD>
                    <TD className="text-right font-medium">{money(Number(l.approved_gross_amount))}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
