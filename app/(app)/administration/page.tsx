import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { Badge } from '@/components/ui/Badge';
import { IconSettings, IconUsers, IconBell, IconGitBranch, IconRotate } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { dateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdministrationPage() {
  await requireAppUser();
  const { tenantId } = await getProjectContext();

  const [tenants, users, roles, workflows, outbox, orgs] = await Promise.all([
    db.tenants.findMany({ orderBy: { name: 'asc' } }),
    db.app_users.findMany({ orderBy: { display_name: 'asc' } }),
    db.roles.findMany({ orderBy: { role_key: 'asc' }, include: { _count: { select: { role_permissions: true } } } }),
    db.workflow_definitions.findMany({ orderBy: { definition_key: 'asc' } }),
    db.outbox_events.findMany({ orderBy: { created_at: 'desc' }, take: 10 }),
    db.organizations.count({ where: { tenant_id: tenantId } }),
  ]);

  const pendingOutbox = outbox.filter((o) => o.status === 'pending').length;

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Administration" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5"><p className="text-sm text-ecms-muted">Tenants</p><p className="mt-1 text-2xl font-bold text-ecms-text">{tenants.length}</p></div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5"><p className="text-sm text-ecms-muted">Users</p><p className="mt-1 text-2xl font-bold text-ecms-text">{users.length}</p></div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5"><p className="text-sm text-ecms-muted">Organizations</p><p className="mt-1 text-2xl font-bold text-ecms-text">{orgs}</p></div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5"><p className="text-sm text-ecms-muted">Workflow Definitions</p><p className="mt-1 text-2xl font-bold text-ecms-amber">{workflows.length}</p></div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5"><p className="text-sm text-ecms-muted">Outbox Pending</p><p className="mt-1 text-2xl font-bold text-ecms-danger">{pendingOutbox}</p></div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card title="Workflow Definitions" icon={<IconGitBranch size={18} />}>
          {workflows.length === 0 ? (
            <EmptyState title="No workflow definitions" message="Approval workflows (IPC, requisition, timesheet) are defined here." />
          ) : (
            <Table>
              <THead><TH>Key</TH><TH>Name</TH><TH>Subject</TH><TH>Version</TH><TH>Status</TH></THead>
              <TBody>
                {workflows.map((w) => (
                  <TR key={w.id}>
                    <TD className="font-medium">{w.definition_key}</TD>
                    <TD>{w.name}</TD>
                    <TD className="text-ecms-muted">{w.subject_type}</TD>
                    <TD>v{w.version_number}</TD>
                    <TD><StatusPill status={w.status} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card title="Roles" subtitle="System and tenant roles with permission counts" icon={<IconUsers size={18} />}>
          {roles.length === 0 ? (
            <EmptyState title="No roles" message="Roles and permissions are defined during setup." />
          ) : (
            <Table>
              <THead><TH>Role Key</TH><TH>Name</TH><TH>Type</TH><TH className="text-right">Permissions</TH></THead>
              <TBody>
                {roles.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-medium">{r.role_key}</TD>
                    <TD>{r.name}</TD>
                    <TD><Badge tone={r.is_system ? 'info' : 'neutral'}>{r.is_system ? 'system' : 'tenant'}</Badge></TD>
                    <TD className="text-right">{r._count.role_permissions}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card title="Recent Outbox Events" subtitle="Event sourcing outbox for worker/notifications" icon={<IconRotate size={18} />}>
          {outbox.length === 0 ? (
            <EmptyState title="No outbox events" message="Domain events awaiting processing appear here." />
          ) : (
            <Table>
              <THead><TH>Aggregate</TH><TH>Event</TH><TH>Status</TH><TH>Attempts</TH><TH>Created</TH></THead>
              <TBody>
                {outbox.map((o) => (
                  <TR key={o.id}>
                    <TD className="text-ecms-muted">{o.aggregate_type}</TD>
                    <TD className="font-medium">{o.event_type}</TD>
                    <TD><StatusPill status={o.status} /></TD>
                    <TD>{o.attempts}</TD>
                    <TD>{dateTime(o.created_at)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card title="Links" icon={<IconSettings size={18} />}>
          <div className="flex flex-col gap-2 text-sm">
            <Link className="rounded-lg bg-ecms-elevated/50 px-3 py-2 font-medium hover:bg-ecms-amber hover:text-ecms-navy" href="/administration/audit">Audit Trail</Link>
            <Link className="rounded-lg bg-ecms-elevated/50 px-3 py-2 font-medium hover:bg-ecms-amber hover:text-ecms-navy" href="/administration/settings">Users, Roles & Tenant Settings</Link>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-ecms-elevated/50 p-3 text-xs text-ecms-muted">
            <IconBell size={14} className="shrink-0" />
            System notifications, workflow tasks and AI control findings are surfaced in their respective modules.
          </div>
        </Card>
      </div>
    </div>
  );
}
