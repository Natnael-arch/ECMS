import { db } from '@/lib/db';

type NotificationInput = {
  tenantId: string;
  userId: string;
  title: string;
  body?: string;
  projectId?: string;
  notificationType: string;
  targetType?: string;
  targetId?: string;
};

export async function createNotification(input: NotificationInput) {
  return db.notifications.create({
    data: {
      tenant_id: input.tenantId,
      user_id: input.userId,
      title: input.title,
      body: input.body ?? null,
      project_id: input.projectId ?? null,
      notification_type: input.notificationType,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
    },
  });
}

export async function notifyProjectMembers(
  tenantId: string,
  projectId: string,
  permissionKey: string,
  title: string,
  body?: string,
  notificationType: string = 'info',
  targetType?: string,
  targetId?: string
) {
  const members = await db.project_members.findMany({
    where: { project_id: projectId, status: 'active' },
    include: {
      project_member_roles: {
        include: { roles: { include: { role_permissions: true } } },
      },
    },
  });

  const notifications = members
    .filter((m) =>
      m.project_member_roles.some((pmr) =>
        pmr.roles.role_permissions.some((rp) => rp.permission_key === permissionKey)
      )
    )
    .map((m) => ({
      tenant_id: tenantId,
      user_id: m.user_id,
      title,
      body: body ?? null,
      project_id: projectId,
      notification_type: notificationType,
      target_type: targetType ?? null,
      target_id: targetId ?? null,
    }));

  if (notifications.length > 0) {
    await db.notifications.createMany({ data: notifications });
  }
}
