import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });
  const auth = await requireApiPermission('measurement.create', projectId);
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const measurement_number = (form.get('measurement_number') as string)?.trim();
  const measurement_date = form.get('measurement_date') as string;
  const contract_id = (form.get('contract_id') as string)?.trim();
  const work_package_id = (form.get('work_package_id') as string)?.trim() || null;
  const contractor_org_id = (form.get('contractor_org_id') as string)?.trim() || null;
  const summary = (form.get('summary') as string)?.trim() || null;

  if (!measurement_number || !measurement_date || !contract_id) {
    return NextResponse.json({ error: 'measurement_number, measurement_date and contract_id are required' }, { status: 400 });
  }

  const measurement = await db.measurements.create({
    data: {
      project_id: projectId,
      contract_id,
      measurement_number,
      measurement_date: new Date(measurement_date),
      work_package_id,
      contractor_org_id,
      summary,
      status: 'draft',
      created_by: userId,
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'measurements',
    entityId: measurement.id,
    after: { measurement_number, measurement_date, contract_id },
  });

  redirect('/field');
}
