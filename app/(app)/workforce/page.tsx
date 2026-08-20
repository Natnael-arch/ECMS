import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { IconPlus, IconUsers } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { money, date } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function WorkforcePage() {
  const ctx = await requireAppUser();
  const { tenantId, projectId } = await getProjectContext();

  const [workers, orgs, attendanceToday] = await Promise.all([
    db.workers.findMany({
      where: projectId ? { project_id: projectId } : { projects: { tenant_id: tenantId } },
      orderBy: { worker_number: 'asc' },
      include: { organizations: { select: { short_name: true, legal_name: true } } },
    }),
    db.organizations.findMany({ where: { tenant_id: tenantId }, select: { id: true, legal_name: true, short_name: true }, orderBy: { legal_name: 'asc' } }),
    db.attendance_records.count({ where: projectId ? { project_id: projectId } : { projects: { tenant_id: tenantId } } }),
  ]);

  const nextNumber = workers.length + 1;
  const activeWorkers = workers.filter((w) => w.status === 'active').length;

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Worker Roster" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5"><p className="text-sm text-ecms-muted">Workers</p><p className="mt-1 text-2xl font-bold text-ecms-text">{workers.length}</p></div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5"><p className="text-sm text-ecms-muted">Active</p><p className="mt-1 text-2xl font-bold text-ecms-success">{activeWorkers}</p></div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5"><p className="text-sm text-ecms-muted">Attendance Records</p><p className="mt-1 text-2xl font-bold text-ecms-amber">{attendanceToday}</p></div>
      </div>

      <Card title="Add Worker" icon={<IconUsers size={18} />}>
        <form method="POST" action="/api/v1/workers" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <select name="employer_org_id" required className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text">
            <option value="">Employer…</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.short_name ?? o.legal_name}</option>)}
          </select>
          <input name="worker_number" defaultValue={`W-${String(nextNumber).padStart(3, '0')}`} className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" />
          <input name="display_name" required className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" placeholder="Full name" />
          <input name="trade" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" placeholder="Trade (e.g. mason)" />
          <input name="regular_hourly_rate" type="number" step="0.01" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" placeholder="Regular rate/hr" />
          <div className="sm:col-span-2 lg:col-span-5">
            <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-ecms-amber px-3 py-1.5 text-sm font-semibold text-ecms-navy hover:bg-ecms-amber/90">
              <IconPlus size={16} /> Add Worker
            </button>
          </div>
        </form>
      </Card>

      <Card>
        {workers.length === 0 ? (
          <EmptyState title="No workers" message="Add workers to build the roster for attendance, timesheets and payroll." />
        ) : (
          <Table>
            <THead><TH>Number</TH><TH>Name</TH><TH>Trade</TH><TH>Employer</TH><TH>Type</TH><TH>Status</TH><TH>Start</TH><TH className="text-right">Regular Rate</TH><TH className="text-right">OT Rate</TH></THead>
            <TBody>
              {workers.map((w) => (
                <TR key={w.id} className="hover:bg-ecms-elevated/40">
                  <TD className="font-medium">{w.worker_number}</TD>
                  <TD>{w.display_name}</TD>
                  <TD className="text-ecms-muted">{w.trade ?? '—'}</TD>
                  <TD className="text-ecms-muted">{w.organizations.short_name ?? w.organizations.legal_name}</TD>
                  <TD className="text-ecms-muted">{w.employment_type}</TD>
                  <TD><StatusPill status={w.status} /></TD>
                  <TD>{date(w.start_date)}</TD>
                  <TD className="text-right">{money(Number(w.regular_hourly_rate))}</TD>
                  <TD className="text-right">{money(Number(w.overtime_hourly_rate))}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
