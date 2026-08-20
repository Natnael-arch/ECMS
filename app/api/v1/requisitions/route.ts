import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });
  const auth = await requireApiPermission('procurement.request', projectId);
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const requisition_number = (form.get('requisition_number') as string)?.trim();
  const purpose = (form.get('purpose') as string)?.trim();
  const required_date = (form.get('required_date') as string) || null;
  const work_package_id = (form.get('work_package_id') as string)?.trim() || null;
  const cost_code_id = (form.get('cost_code_id') as string)?.trim() || null;
  const line_desc = (form.get('line_desc') as string)?.trim();
  const line_qty = Number(form.get('line_qty'));
  const line_unit = (form.get('line_unit') as string)?.trim() || 'no';

  if (!requisition_number || !purpose) {
    return NextResponse.json({ error: 'requisition_number and purpose are required' }, { status: 400 });
  }

  const requisition = await db.purchase_requisitions.create({
    data: {
      project_id: projectId,
      requisition_number,
      purpose,
      status: 'draft',
      work_package_id,
      cost_code_id,
      required_date: required_date ? new Date(required_date) : null,
      requested_by: userId,
      ...(line_desc && !Number.isNaN(line_qty)
        ? {
            purchase_requisition_lines: {
              create: [
                {
                  line_number: 1,
                  description: line_desc,
                  unit: line_unit,
                  requested_quantity: line_qty,
                },
              ],
            },
          }
        : {}),
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'purchase_requisitions',
    entityId: requisition.id,
    after: { requisition_number, purpose, required_date },
  });

  redirect('/procurement/requisitions');
});
