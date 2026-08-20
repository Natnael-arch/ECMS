import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Badge } from '@/components/ui/Badge';
import { IconBuilding, IconPlus } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { money, date, num } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const ctx = await requireAppUser();
  const { tenantId } = await getProjectContext();

  const [projects, contracts] = await Promise.all([
    db.projects.findMany({ where: { tenant_id: tenantId }, orderBy: { created_at: 'asc' }, include: { _count: { select: { contracts: true, measurements: true, ipc_certificates: true } } } }),
    db.contracts.findMany({ where: { projects: { tenant_id: tenantId } }, orderBy: { revised_contract_amount: 'desc' }, take: 5, include: { projects: { select: { project_code: true, name: true } } } }),
  ]);

  const contractTotals = new Map<string, number>();
  for (const c of contracts) contractTotals.set(c.project_id, (contractTotals.get(c.project_id) ?? 0) + Number(c.revised_contract_amount));

  const statuses = ['draft', 'active', 'suspended', 'completed', 'archived'] as const;

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title="Project Register"
        actions={
          <form method="POST" action="/api/v1/projects" className="flex flex-wrap items-center gap-2">
            <input name="project_code" placeholder="Code (e.g. HW-001)" required className="rounded-lg border border-ecms-border bg-ecms-card px-3 py-1.5 text-sm text-ecms-text placeholder:text-ecms-muted" />
            <input name="name" placeholder="Project name" required className="rounded-lg border border-ecms-border bg-ecms-card px-3 py-1.5 text-sm text-ecms-text placeholder:text-ecms-muted" />
            <select name="status" className="rounded-lg border border-ecms-border bg-ecms-card px-3 py-1.5 text-sm text-ecms-text">
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-ecms-amber px-3 py-1.5 text-sm font-semibold text-ecms-navy hover:bg-ecms-amber/90">
              <IconPlus size={16} /> New Project
            </button>
          </form>
        }
      />

      <Card>
        {projects.length === 0 ? (
          <EmptyState icon={<IconBuilding size={32} />} title="No projects yet" message="Create your first project using the form above." />
        ) : (
          <Table>
            <THead><TH>Code</TH><TH>Name</TH><TH>Status</TH><TH>Sector</TH><TH>Start</TH><TH>Finish</TH><TH className="text-right">Contract Value</TH><TH>Counts</TH></THead>
            <TBody>
              {projects.map((p) => (
                <TR key={p.id} className="hover:bg-ecms-elevated/40">
                  <TD className="font-medium">
                    <Link className="hover:text-ecms-amber" href={`/contracts?project=${p.id}`}>{p.project_code}</Link>
                  </TD>
                  <TD className="max-w-[280px] truncate">{p.name}</TD>
                  <TD><StatusPill status={p.status} /></TD>
                  <TD className="text-ecms-muted">{p.sector}</TD>
                  <TD>{date(p.planned_start_date)}</TD>
                  <TD>{date(p.planned_finish_date)}</TD>
                  <TD className="text-right font-medium">{money(contractTotals.get(p.id) ?? 0, p.currency)}</TD>
                  <TD>
                    <div className="flex gap-1">
                      <Badge tone="neutral">{p._count.contracts} contracts</Badge>
                      <Badge tone="info">{p._count.measurements} meas.</Badge>
                      <Badge tone="warning">{p._count.ipc_certificates} IPCs</Badge>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card title="Top Contracts by Value" icon={<IconBuilding size={18} />}>
        {contracts.length === 0 ? (
          <EmptyState title="No contracts" message="Contracts will appear once created against a project." />
        ) : (
          <Table>
            <THead><TH>Contract</TH><TH>Project</TH><TH>Title</TH><TH>Status</TH><TH className="text-right">Revised Amount</TH></THead>
            <TBody>
              {contracts.map((c) => (
                <TR key={c.id} className="hover:bg-ecms-elevated/40">
                  <TD className="font-medium">{c.contract_number}</TD>
                  <TD>{c.projects.project_code}</TD>
                  <TD className="max-w-[280px] truncate text-ecms-muted">{c.title}</TD>
                  <TD><StatusPill status={c.status} /></TD>
                  <TD className="text-right font-medium">{money(Number(c.revised_contract_amount), c.currency)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
