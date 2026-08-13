import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';

export type ProjectContext = {
  tenantId: string;
  projectId: string | null;
  userId: string;
  roles: string[];
};

export async function getProjectContext(): Promise<ProjectContext> {
  const ctx = await requireAppUser();
  const tenant = await db.tenants.findFirst({ orderBy: { created_at: 'asc' } });
  const project = tenant
    ? await db.projects.findFirst({ where: { tenant_id: tenant.id }, orderBy: { created_at: 'asc' } })
    : null;
  return {
    tenantId: tenant?.id ?? '',
    projectId: project?.id ?? null,
    userId: ctx.appUser.id,
    roles: ctx.roles,
  };
}

export function isAdmin(ctx: Pick<ProjectContext, 'roles'>) {
  return ctx.roles.includes('admin');
}
