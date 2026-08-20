import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { IconLicense } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { money, date } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  await requireAppUser();
  const { tenantId } = await getProjectContext();

  const contracts = await db.contracts.findMany({
    where: project ? { project_id: project } : { projects: { tenant_id: tenantId } },
    orderBy: [{ status: 'asc' }, { contract_number: 'asc' }],
    include: {
      projects: { select: { project_code: true, name: true } },
      variations: { where: { status: { in: ['approved', 'incorporated'] } }, select: { approved_value: true } },
      ipc_certificates: { where: { status: { in: ['certified', 'paid'] } }, select: { net_current_amount: true } },
      boq_versions: { select: { version_number: true, status: true, grand_total: true } },
    },
  });

  const projects = await db.projects.findMany({ where: { tenant_id: tenantId }, select: { id: true, project_code: true }, orderBy: { project_code: 'asc' } });

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Contract Register" />

      <form method="GET" className="flex items-center gap-2">
        <select name="project" defaultValue={project ?? ''} className="rounded-lg border border-ecms-border bg-ecms-card px-3 py-1.5 text-sm text-ecms-text">
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.project_code}</option>
          ))}
        </select>
        <button type="submit" className="rounded-lg bg-ecms-elevated px-3 py-1.5 text-sm font-semibold text-ecms-text hover:bg-ecms-amber hover:text-ecms-navy">Filter</button>
      </form>

      <Card>
        {contracts.length === 0 ? (
          <EmptyState icon={<IconLicense size={32} />} title="No contracts" message="Contracts appear here once created against a project." />
        ) : (
          <Table>
            <THead><TH>Contract</TH><TH>Project</TH><TH>Title</TH><TH>Type</TH><TH>Status</TH><TH>Signed</TH><TH>Completion</TH><TH className="text-right">Revised Amount</TH><TH className="text-right">Variations</TH><TH className="text-right">Certified</TH></THead>
            <TBody>
              {contracts.map((c) => {
                const variations = c.variations.reduce((s, v) => s + Number(v.approved_value), 0);
                const certified = c.ipc_certificates.reduce((s, i) => s + Number(i.net_current_amount), 0);
                const approvedBoq = c.boq_versions?.status === 'approved' ? c.boq_versions : null;
                return (
                  <TR key={c.id} className="hover:bg-ecms-elevated/40">
                    <TD className="font-medium">{c.contract_number}</TD>
                    <TD>{c.projects.project_code}</TD>
                    <TD className="max-w-[260px] truncate text-ecms-muted">{c.title}</TD>
                    <TD className="text-ecms-muted">{c.contract_type ?? '—'}</TD>
                    <TD><StatusPill status={c.status} /></TD>
                    <TD>{date(c.signed_date)}</TD>
                    <TD>{date(c.planned_completion_date)}</TD>
                    <TD className="text-right font-medium">{money(Number(c.revised_contract_amount), c.currency)}</TD>
                    <TD className="text-right">{money(variations, c.currency)}</TD>
                    <TD className="text-right">{money(certified, c.currency)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {contracts.slice(0, 6).map((c) => (
          <Card key={c.id} title={`${c.contract_number} · ${c.projects.project_code}`} subtitle={c.title} icon={<IconLicense size={18} />} bodyClassName="pt-3">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ecms-muted">Original</dt><dd className="font-medium">{money(Number(c.original_contract_amount), c.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-ecms-muted">Revised</dt><dd className="font-medium">{money(Number(c.revised_contract_amount), c.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-ecms-muted">VAT</dt><dd className="font-medium">{Number(c.vat_percent)}%</dd></div>
              <div className="flex justify-between"><dt className="text-ecms-muted">Retention</dt><dd className="font-medium">{Number(c.retention_percent)}%</dd></div>
              <div className="flex justify-between"><dt className="text-ecms-muted">Performance security</dt><dd className="font-medium">{Number(c.performance_security_percent)}%</dd></div>
              <div className="flex justify-between"><dt className="text-ecms-muted">Advance</dt><dd className="font-medium">{Number(c.advance_percent)}%</dd></div>
              <div className="flex justify-between"><dt className="text-ecms-muted">Time for completion</dt><dd className="font-medium">{c.time_for_completion_days ?? '—'} days</dd></div>
              <div className="flex justify-between"><dt className="text-ecms-muted">Min IPC amount</dt><dd className="font-medium">{money(Number(c.minimum_ipc_amount), c.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-ecms-muted">Commencement</dt><dd className="font-medium">{date(c.commencement_date)}</dd></div>
              <div className="flex justify-between"><dt className="text-ecms-muted">Planned completion</dt><dd className="font-medium">{date(c.planned_completion_date)}</dd></div>
            </dl>
            {c.boq_versions?.status === 'approved' && (
              <p className="mt-3 text-xs text-ecms-muted">Approved BOQ v{c.boq_versions.version_number} · total {money(Number(c.boq_versions.grand_total), c.currency)}</p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
