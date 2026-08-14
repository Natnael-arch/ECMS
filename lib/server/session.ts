import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
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
  projectId?: string | null;
};

const SUPER_ROLE_KEYS = ['admin', 'tenant_admin'];

/**
 * Minimal slice of the Prisma client used for permission resolution. Kept as a
 * structural type so the resolution logic can be unit-tested without a live
 * database.
 */
type PermissionDb = {
  tenant_member_roles: {
    findMany: (args: {
      where: { user_id: string };
      select: { role_id: true; role: { select: { role_key: true } } };
    }) => Promise<Array<{ role_id: string; role: { role_key: string } }>>;
  };
  role_permissions: {
    findMany: (args: {
      where: { role_id: { in: string[] } };
      select: { permission_key: true };
    }) => Promise<Array<{ permission_key: string }>>;
  };
  permissions: {
    findMany: (args: { select: { permission_key: true } }) => Promise<Array<{ permission_key: string }>>;
  };
  project_members: {
    findUnique: (args: {
      where: { project_id_user_id: { project_id: string; user_id: string } };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
  project_member_roles: {
    findMany: (args: {
      where: { project_member_id: string };
      select: {
        role: {
          select: {
            role_key: true;
            role_permissions: { select: { permission_key: true } };
          };
        };
      };
    }) => Promise<
      Array<{ role: { role_key: string; role_permissions: Array<{ permission_key: string }> } }>
    >;
  };
};

/**
 * Resolve a user's effective roles and permissions.
 *
 * Project-scoped by default: permissions come from the current project's
 * `project_member_roles` (via `project_members`). Tenant-wide roles are only a
 * fallback for super-user roles (`admin`/`tenant_admin`), who get every
 * permission. When `projectId` is null (no active project, e.g. tenant-level
 * operations) the user's own tenant-wide role grants are used instead.
 */
export async function resolveEffectivePermissions(
  userId: string,
  projectId: string | null,
  dbClient: PermissionDb
): Promise<{ roles: string[]; permissions: string[] }> {
  const tenantRoles = await dbClient.tenant_member_roles.findMany({
    where: { user_id: userId },
    select: { role_id: true, role: { select: { role_key: true } } },
  });
  const tenantRoleKeys = tenantRoles.map((r) => r.role.role_key);

  if (SUPER_ROLE_KEYS.some((k) => tenantRoleKeys.includes(k))) {
    const all = await dbClient.permissions.findMany({ select: { permission_key: true } });
    return { roles: tenantRoleKeys, permissions: all.map((p) => p.permission_key) };
  }

  if (projectId) {
    const member = await dbClient.project_members.findUnique({
      where: { project_id_user_id: { project_id: projectId, user_id: userId } },
      select: { id: true },
    });
    if (!member) return { roles: [], permissions: [] };

    const assignments = await dbClient.project_member_roles.findMany({
      where: { project_member_id: member.id },
      select: {
        role: {
          select: { role_key: true, role_permissions: { select: { permission_key: true } } },
        },
      },
    });

    const roles = assignments.map((a) => a.role.role_key);
    const permissions = Array.from(
      new Set(assignments.flatMap((a) => a.role.role_permissions.map((p) => p.permission_key)))
    );
    return { roles, permissions };
  }

  if (tenantRoles.length === 0) return { roles: [], permissions: [] };

  const rows = await dbClient.role_permissions.findMany({
    where: { role_id: { in: tenantRoles.map((r) => r.role_id) } },
    select: { permission_key: true },
  });
  return { roles: tenantRoleKeys, permissions: rows.map((p) => p.permission_key) };
}

export function hasAnyPermission(roles: string[], permissions: string[], key: string): boolean {
  return SUPER_ROLE_KEYS.some((k) => roles.includes(k)) || permissions.includes(key);
}

export async function getAppUser(opts: { projectId?: string | null } = {}): Promise<AppUserCtx | null> {
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

  const { roles, permissions } = await resolveEffectivePermissions(
    appUser.id,
    opts.projectId ?? null,
    db as unknown as PermissionDb
  );

  return { session, appUser, roles, permissions, projectId: opts.projectId ?? null };
}

export async function requireAppUser(): Promise<AppUserCtx> {
  const ctx = await getAppUser();
  if (!ctx) redirect('/login');
  return ctx;
}

export async function hasPermission(
  key: string,
  opts: { projectId?: string | null } = {}
): Promise<boolean> {
  const ctx = await getAppUser(opts);
  if (!ctx) return false;
  return hasAnyPermission(ctx.roles, ctx.permissions, key);
}

export async function requirePermission(
  key: string,
  opts: { projectId?: string | null } = {}
): Promise<AppUserCtx> {
  const ctx = await getAppUser(opts);
  if (!ctx) redirect('/login');
  if (!hasAnyPermission(ctx.roles, ctx.permissions, key)) {
    redirect('/forbidden');
  }
  return ctx;
}

export async function requireApiPermission(
  key: string,
  projectId?: string | null
): Promise<AppUserCtx | NextResponse> {
  const ctx = await getAppUser({ projectId: projectId ?? null });
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasAnyPermission(ctx.roles, ctx.permissions, key)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return ctx;
}

/** Permission required for each IPC target status transition. */
export const IPC_TARGET_PERMISSIONS: Record<string, string> = {
  submitted: 'ipc.prepare',
  under_review: 'ipc.review',
  recommended: 'ipc.review',
  returned: 'ipc.review',
  certified: 'ipc.certify',
  paid: 'payment.record',
};
