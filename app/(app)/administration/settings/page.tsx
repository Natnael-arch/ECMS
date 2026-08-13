import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Badge } from '@/components/ui/Badge';
import { IconUsers, IconBuilding } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { dateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const ctx = await requireAppUser();
  const { tenantId } = await getProjectContext();

  const [users, tenants, memberships, orgs, workflows] = await Promise.all([
    db.app_users.findMany({ orderBy: { display_name: 'asc' } }),
    db.tenants.findMany({ orderBy: { name: 'asc' } }),
    db.tenant_memberships.findMany({
      where: { tenant_id: tenantId },
      include: {
        app_users: { select: { display_name: true, email: true } },
        organizations: { select: { short_name: true } },
        tenant_member_roles: { include: { roles: { select: { role_key: true, name: true } } } },
      },
    }),
    db.organizations.findMany({ where: { tenant_id: tenantId }, orderBy: { legal_name: 'asc' } }),
    db.workflow_tasks.findMany({ where: { assigned_user_id: ctx.appUser.id, status: { in: ['pending', 'active'] } }, orderBy: { due_at: 'asc' }, take: 20 }),
  ]);

  const systemWorkflows = await db.workflow_definitions.findMany({ where: { tenant_id: tenantId }, orderBy: { definition_key: 'asc' } });

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Users, Roles & Settings" />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card title="My Workflow Tasks" icon={<IconUsers size={18} />} className="xl:col-span-1">
          {workflows.length === 0 ? (
            <EmptyState title="No pending tasks" message="Approval tasks assigned to you will appear here." />
          ) : (
            <Table>
              <THead><TH>Step</TH><TH>Status</TH><TH>Due</TH></THead>
              <TBody>
                {workflows.map((t) => (
                  <TR key={t.id}>
                    <TD className="font-medium">Step {t.step_number}</TD>
                    <TD><Badge tone={t.status === 'active' ? 'warning' : 'neutral'}>{t.status}</Badge></TD>
                    <TD className="text-ecms-muted">{t.due_at ? dateTime(t.due_at) : '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card title="Tenant Members" icon={<IconUsers size={18} />} className="xl:col-span-2">
          {memberships.length === 0 ? (
            <EmptyState title="No members" message="Users added to this tenant appear here." />
          ) : (
            <Table>
              <THead><TH>User</TH><TH>Organization</TH><TH>Status</TH><TH>Roles</TH></THead>
              <TBody>
                {memberships.map((m) => (
                  <TR key={`${m.tenant_id}-${m.user_id}`}>
                    <TD>
                      <div className="font-medium">{m.app_users.display_name}</div>
                      <div className="text-xs text-ecms-muted">{m.app_users.email}</div>
                    </TD>
                    <TD className="text-ecms-muted">{m.organizations?.short_name ?? '—'}</TD>
                    <TD><Badge tone={m.status === 'active' ? 'success' : m.status === 'invited' ? 'warning' : 'neutral'}>{m.status}</Badge></TD>
                    <TD className="text-ecms-muted">{m.tenant_member_roles.map((r) => r.roles.role_key).join(', ') || '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card title="Tenants" icon={<IconBuilding size={18} />}>
          {tenants.length === 0 ? (
            <EmptyState title="No tenants" message="Organization tenants appear here." />
          ) : (
            <Table>
              <THead><TH>Name</TH><TH>Slug</TH><TH>Currency</TH><TH>Timezone</TH><TH>Created</TH></THead>
              <TBody>
                {tenants.map((t) => (
                  <TR key={t.id}>
                    <TD className="font-medium">{t.name}</TD>
                    <TD className="text-ecms-muted">{t.slug}</TD>
                    <TD>{t.default_currency}</TD>
                    <TD className="text-ecms-muted">{t.timezone}</TD>
                    <TD>{dateTime(t.created_at)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card title="Organizations" icon={<IconBuilding size={18} />}>
          {orgs.length === 0 ? (
            <EmptyState title="No organizations" message="Employer, engineer, contractor and supplier organizations appear here." />
          ) : (
            <Table>
              <THead><TH>Legal Name</TH><TH>Short Name</TH><TH>Type</TH><TH>Active</TH></THead>
              <TBody>
                {orgs.map((o) => (
                  <TR key={o.id}>
                    <TD className="font-medium">{o.legal_name}</TD>
                    <TD className="text-ecms-muted">{o.short_name ?? '—'}</TD>
                    <TD className="text-ecms-muted">{o.organization_type}</TD>
                    <TD><Badge tone={o.is_active ? 'success' : 'neutral'}>{o.is_active ? 'active' : 'inactive'}</Badge></TD>
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
