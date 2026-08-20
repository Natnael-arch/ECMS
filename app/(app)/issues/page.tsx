import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Badge } from '@/components/ui/Badge';
import { IconPlus, IconAlertTriangle } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { date } from '@/lib/format';

export const dynamic = 'force-dynamic';

const severityTone: Record<string, 'info' | 'neutral' | 'warning' | 'danger'> = {
  info: 'info', low: 'neutral', medium: 'warning', high: 'danger', critical: 'danger',
};

export default async function IssuesPage() {
  const ctx = await requireAppUser();
  const { tenantId, projectId } = await getProjectContext();

  const issues = await db.issues.findMany({
    where: projectId ? { project_id: projectId } : { projects: { tenant_id: tenantId } },
    orderBy: { created_at: 'desc' },
    include: {
      contracts: { select: { contract_number: true } },
      app_users_issues_assigned_toToapp_users: { select: { display_name: true } },
      app_users_issues_created_byToapp_users: { select: { display_name: true } },
      _count: { select: { issue_comments: true } },
    },
  });

  const nextNumber = issues.length + 1;

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Issue Register" />

      <Card title="Raise Issue" icon={<IconAlertTriangle size={18} />}>
        <form method="POST" action="/api/v1/issues" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <input name="issue_number" defaultValue={`ISS-${String(nextNumber).padStart(3, '0')}`} className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" />
          <input name="title" required className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" placeholder="Title" />
          <select name="issue_type" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text">
            {['quality', 'safety', 'programme', 'cost', 'contractual', 'site', 'other'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select name="severity" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text">
            {['info', 'low', 'medium', 'high', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input name="due_date" type="date" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" />
          <button type="submit" className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-ecms-amber px-3 py-1.5 text-sm font-semibold text-ecms-navy hover:bg-ecms-amber/90">
            <IconPlus size={16} /> Raise
          </button>
        </form>
      </Card>

      <Card>
        {issues.length === 0 ? (
          <EmptyState title="No issues" message="Quality, safety and contractual issues appear here." />
        ) : (
          <Table>
            <THead><TH>Number</TH><TH>Type</TH><TH>Title</TH><TH>Contract</TH><TH>Severity</TH><TH>Assignee</TH><TH>Due</TH><TH>Status</TH><TH>Comments</TH></THead>
            <TBody>
              {issues.map((i) => (
                <TR key={i.id} className="hover:bg-ecms-elevated/40">
                  <TD className="font-medium">{i.issue_number}</TD>
                  <TD className="text-ecms-muted">{i.issue_type}</TD>
                  <TD className="max-w-[240px] truncate">{i.title}</TD>
                  <TD className="text-ecms-muted">{i.contracts?.contract_number ?? '—'}</TD>
                  <TD><Badge tone={severityTone[i.severity]}>{i.severity}</Badge></TD>
                  <TD className="text-ecms-muted">{i.app_users_issues_assigned_toToapp_users?.display_name ?? 'Unassigned'}</TD>
                  <TD>{date(i.due_date)}</TD>
                  <TD><StatusPill status={i.status} /></TD>
                  <TD>{i._count.issue_comments}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
