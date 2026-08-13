import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export type AppUserCtx = {
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>;
  appUser: NonNullable<Awaited<ReturnType<typeof db.app_users.findUnique>>>;
  roles: string[];
  permissions: string[];
};

export async function getAppUser(): Promise<AppUserCtx | null> {
  const session = await getSession();
  if (!session?.user) return null;

  let appUser = await db.app_users.findUnique({
    where: { auth_subject: session.user.id },
  });

  if (!appUser) {
    const firstTenant = await db.tenants.findFirst({ orderBy: { created_at: 'asc' } });
    appUser = await db.app_users.create({
      data: {
        auth_subject: session.user.id,
        email: session.user.email,
        display_name: session.user.name || session.user.email,
      },
    });
    if (firstTenant) {
      const existing = await db.tenant_memberships.findUnique({
        where: { tenant_id_user_id: { tenant_id: firstTenant.id, user_id: appUser.id } },
      });
      if (!existing) {
        await db.tenant_memberships.create({
          data: { tenant_id: firstTenant.id, user_id: appUser.id, status: 'active' },
        });
      }
    }
  }

  const [roles, permissions] = await Promise.all([
    db.tenant_member_roles.findMany({
      where: { user_id: appUser.id },
      select: { role: { select: { role_key: true } } },
    }),
    db.role_permissions.findMany({
      where: {
        role: {
          OR: [{ tenant_id: null }, ...(await db.tenant_memberships.findMany({
            where: { user_id: appUser.id },
            select: { tenant_id: true },
          })).map((m) => ({ tenant_id: m.tenant_id }))],
        },
      },
      select: { permission_key: true },
    }),
  ]);

  return {
    session,
    appUser,
    roles: roles.map((r) => r.role.role_key),
    permissions: permissions.map((p) => p.permission_key),
  };
}

export async function requireAppUser(): Promise<AppUserCtx> {
  const ctx = await getAppUser();
  if (!ctx) redirect('/login');
  return ctx;
}

export async function hasPermission(key: string): Promise<boolean> {
  const ctx = await getAppUser();
  if (!ctx) return false;
  return ctx.roles.includes('admin') || ctx.permissions.includes(key);
}

export async function requirePermission(key: string): Promise<AppUserCtx> {
  const ctx = await requireAppUser();
  if (!ctx.roles.includes('admin') && !ctx.permissions.includes(key)) {
    redirect('/forbidden');
  }
  return ctx;
}
