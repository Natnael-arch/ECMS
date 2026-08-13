import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { IconPlus, IconClockHour4 } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { money, date } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function TimesheetsPage() {
  const ctx = await requireAppUser();
  const { tenantId, projectId } = await getProjectContext();

  const [timesheets, workers] = await Promise.all([
    db.timesheets.findMany({
      where: projectId ? { project_id: projectId } : { project: { tenant_id: tenantId } },
      orderBy: { period_end: 'desc' },
      include: {
        contracts: { select: { contract_number: true } },
        app_users_timesheets_foreman_idToapp_users: { select: { display_name: true } },
        _count: { select: { timesheet_lines: true } },
      },
    }),
    db.workers.findMany({ where: projectId ? { project_id: projectId } : { project: { tenant_id: tenantId } }, select: { id: true, worker_number: true, display_name: true }, orderBy: { display_name: 'asc' } }),
  ]);

  const nextNumber = timesheets.length + 1;

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Timesheets" />

      <Card title="New Timesheet" icon={<IconClockHour4 size={18} />}>
        <form method="POST" action="/api/v1/timesheets" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <input name="timesheet_number" defaultValue={`TS-${String(nextNumber).padStart(3, '0')}`} className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" />
          <input name="period_start" type="date" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" />
          <input name="period_end" type="date" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" />
          <select name="worker_id" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text">
            <option value="">Worker (optional)</option>
            {workers.map((w) => <option key={w.id} value={w.id}>{w.worker_number} · {w.display_name}</option>)}
          </select>
          <input name="work_date" type="date" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" />
          <input name="regular_hours" type="number" step="0.5" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" placeholder="Regular hrs" />
          <div className="sm:col-span-2 lg:col-span-6">
            <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-ecms-amber px-3 py-1.5 text-sm font-semibold text-ecms-navy hover:bg-ecms-amber/90">
              <IconPlus size={16} /> Create Draft
            </button>
          </div>
        </form>
      </Card>

      <Card>
        {timesheets.length === 0 ? (
          <EmptyState title="No timesheets" message="Weekly timesheets submitted by foremen appear here." />
        ) : (
          <Table>
            <THead><TH>Number</TH><TH>Contract</TH><TH>Period</TH><TH>Foreman</TH><TH>Status</TH><TH>Lines</TH></THead>
            <TBody>
              {timesheets.map((t) => (
                <TR key={t.id} className="hover:bg-ecms-elevated/40">
                  <TD className="font-medium">{t.timesheet_number}</TD>
                  <TD className="text-ecms-muted">{t.contracts?.contract_number ?? '—'}</TD>
                  <TD className="whitespace-nowrap">{date(t.period_start)} – {date(t.period_end)}</TD>
                  <TD className="text-ecms-muted">{t.app_users_timesheets_foreman_idToapp_users?.display_name ?? '—'}</TD>
                  <TD><StatusPill status={t.status} /></TD>
                  <TD>{t._count.timesheet_lines}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
