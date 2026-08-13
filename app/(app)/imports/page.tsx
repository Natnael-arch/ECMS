import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Badge } from '@/components/ui/Badge';
import { IconFileText } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { dateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ImportsPage() {
  await requireAppUser();
  const { tenantId, projectId } = await getProjectContext();

  const jobs = await db.import_jobs.findMany({
    where: projectId ? { project_id: projectId } : { project: { tenant_id: tenantId } },
    orderBy: { created_at: 'desc' },
    include: {
      app_users: { select: { display_name: true } },
      _count: { select: { import_rows: true, import_exceptions: true } },
    },
  });

  const byStatus = new Map<string, number>();
  for (const j of jobs) byStatus.set(j.status, (byStatus.get(j.status) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Data Import Centre" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5"><p className="text-sm text-ecms-muted">Import Jobs</p><p className="mt-1 text-2xl font-bold text-ecms-text">{jobs.length}</p></div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5">
          <p className="text-sm text-ecms-muted">By Status</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {[...byStatus.entries()].map(([status, count]) => (
              <Badge key={status} tone={status === 'completed' ? 'success' : status === 'failed' ? 'danger' : status === 'completed_with_exceptions' ? 'warning' : 'neutral'}>{status} ({count})</Badge>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5">
          <p className="text-sm text-ecms-muted">Import Kinds</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {[...new Set(jobs.map((j) => j.import_kind))].map((k) => (
              <Badge key={k} tone="info">{k}</Badge>
            ))}
          </div>
        </div>
      </div>

      <Card icon={<IconFileText size={18} />}>
        {jobs.length === 0 ? (
          <EmptyState title="No import jobs" message="Uploaded BOQ, timesheet and ledger imports will appear here for mapping, validation and commit." />
        ) : (
          <Table>
            <THead><TH>Source</TH><TH>Kind</TH><TH>Status</TH><TH>Uploaded By</TH><TH>Rows</TH><TH>Exceptions</TH><TH>Started</TH><TH>Completed</TH><TH>Created</TH></THead>
            <TBody>
              {jobs.map((j) => (
                <TR key={j.id} className="hover:bg-ecms-elevated/40">
                  <TD className="max-w-[220px] truncate font-medium">{j.source_name}</TD>
                  <TD className="text-ecms-muted">{j.import_kind}</TD>
                  <TD><StatusPill status={j.status} /></TD>
                  <TD className="text-ecms-muted">{j.app_users?.display_name ?? '—'}</TD>
                  <TD>{j._count.import_rows}</TD>
                  <TD>{j._count.import_exceptions}</TD>
                  <TD>{j.started_at ? dateTime(j.started_at) : '—'}</TD>
                  <TD>{j.completed_at ? dateTime(j.completed_at) : '—'}</TD>
                  <TD className="text-ecms-muted">{dateTime(j.created_at)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
