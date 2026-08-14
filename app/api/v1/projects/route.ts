import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import type { project_status } from '@/lib/generated/prisma/client';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { tenantId, projectId, userId } = await getProjectContext();
  const auth = await requireApiPermission('project.create', projectId);
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const project_code = (form.get('project_code') as string)?.trim();
  const name = (form.get('name') as string)?.trim();
  const status = ((form.get('status') as string)?.trim() || 'draft') as project_status;

  if (!project_code || !name) {
    return NextResponse.json({ error: 'project_code and name are required' }, { status: 400 });
  }

  const project = await db.projects.create({
    data: {
      tenant_id: tenantId,
      project_code,
      name,
      status,
      created_by: userId,
    },
  });

  await writeAudit({
    tenantId,
    projectId: project.id,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'projects',
    entityId: project.id,
    after: { project_code, name, status },
  });

  redirect('/projects');
}
