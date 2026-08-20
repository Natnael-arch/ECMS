import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });
  const auth = await requireApiPermission('variation.create', projectId);
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const contract_id = (form.get('contract_id') as string)?.trim();
  const variation_number = (form.get('variation_number') as string)?.trim();
  const title = (form.get('title') as string)?.trim();
  const description = (form.get('description') as string)?.trim() || null;
  const variation_type = (form.get('variation_type') as string)?.trim() || null;

  if (!contract_id || !variation_number || !title) {
    return NextResponse.json(
      { error: 'contract_id, variation_number and title are required' },
      { status: 400 }
    );
  }

  const contract = await db.contracts.findUnique({ where: { id: contract_id } });
  if (!contract) return NextResponse.json({ error: 'Contract not found' }, { status: 404 });

  const variation = await db.variations.create({
    data: {
      project_id: projectId,
      contract_id,
      variation_number,
      title,
      description,
      initiated_by: userId,
      status: 'draft',
      reason_code: variation_type,
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'variations',
    entityId: variation.id,
    after: { contract_id, variation_number, title, status: 'draft', variation_type },
  });

  return NextResponse.json(variation, { status: 201 });
});
