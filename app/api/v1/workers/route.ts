import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import type { worker_status } from '@/lib/generated/prisma/client';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });
  const auth = await requireApiPermission('worker.manage', projectId);
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const employer_org_id = (form.get('employer_org_id') as string)?.trim();
  const worker_number = (form.get('worker_number') as string)?.trim();
  const display_name = (form.get('display_name') as string)?.trim();
  const trade = (form.get('trade') as string)?.trim() || null;
  const regular_hourly_rate = Number(form.get('regular_hourly_rate') ?? 0);

  if (!employer_org_id || !worker_number || !display_name) {
    return NextResponse.json({ error: 'employer_org_id, worker_number and display_name are required' }, { status: 400 });
  }

  const worker = await db.workers.create({
    data: {
      project_id: projectId,
      employer_org_id,
      worker_number,
      display_name,
      trade,
      status: 'active' as worker_status,
      regular_hourly_rate: Number.isNaN(regular_hourly_rate) ? 0 : regular_hourly_rate,
      created_by: userId,
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'workers',
    entityId: worker.id,
    after: { worker_number, display_name, trade, employer_org_id },
  });

  redirect('/workforce');
}
