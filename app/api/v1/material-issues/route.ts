import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  await requireAppUser();
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const form = await req.formData();
  const issue_number = (form.get('issue_number') as string)?.trim();
  const issue_date = (form.get('issue_date') as string) || null;
  const warehouse_id = (form.get('warehouse_id') as string)?.trim();
  const work_package_id = (form.get('work_package_id') as string)?.trim();
  const purpose = (form.get('purpose') as string)?.trim();
  const recipient_name = (form.get('recipient_name') as string)?.trim() || null;

  if (!issue_number || !warehouse_id || !work_package_id || !purpose) {
    return NextResponse.json({ error: 'issue_number, warehouse_id, work_package_id and purpose are required' }, { status: 400 });
  }

  const warehouse = await db.warehouses.findFirst({ where: { id: warehouse_id, project_id: projectId } });
  if (!warehouse) return NextResponse.json({ error: 'Invalid warehouse' }, { status: 400 });

  const issue = await db.material_issues.create({
    data: {
      project_id: projectId,
      warehouse_id,
      work_package_id,
      issue_number,
      issue_date: issue_date ? new Date(issue_date) : new Date(),
      purpose,
      status: 'draft',
      requested_by: userId,
      recipient_name,
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'material_issues',
    entityId: issue.id,
    after: { issue_number, issue_date, warehouse_id, work_package_id, purpose },
  });

  redirect('/stores/issues');
}
