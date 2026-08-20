import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { projectId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });
  const auth = await requireApiPermission('boq.manage', projectId);
  if (auth instanceof NextResponse) return auth;

  const version = await db.boq_versions.findUnique({ where: { id } });
  if (!version) return NextResponse.json({ error: 'BOQ version not found' }, { status: 404 });

  const items = await db.boq_items.findMany({
    where: { boq_version_id: id },
    orderBy: [{ sort_order: 'asc' }, { item_number: 'asc' }],
  });

  return NextResponse.json(items);
});

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: boqVersionId } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });
  const auth = await requireApiPermission('boq.manage', projectId);
  if (auth instanceof NextResponse) return auth;

  const version = await db.boq_versions.findUnique({ where: { id: boqVersionId } });
  if (!version) return NextResponse.json({ error: 'BOQ version not found' }, { status: 404 });
  if (version.status !== 'draft') {
    return NextResponse.json({ error: 'Can only add items to a draft BOQ version' }, { status: 409 });
  }

  const form = await req.formData();
  const item_number = (form.get('item_number') as string)?.trim();
  const description = (form.get('description') as string)?.trim();
  const unit = (form.get('unit') as string)?.trim() || null;
  const quantity = parseFloat(form.get('quantity') as string) || 0;
  const unit_rate = parseFloat(form.get('unit_rate') as string) || 0;
  const section_id = (form.get('section_id') as string)?.trim() || null;
  const contractId = (form.get('contractId') as string)?.trim() || '';

  if (!item_number || !description) {
    return NextResponse.json({ error: 'item_number and description are required' }, { status: 400 });
  }

  const existingItem = await db.boq_items.findFirst({
    where: { boq_version_id: boqVersionId, item_number },
  });
  if (existingItem) {
    return NextResponse.json({ error: `Item number ${item_number} already exists` }, { status: 409 });
  }

  const item = await db.boq_items.create({
    data: {
      boq_version_id: boqVersionId,
      item_number,
      description,
      unit,
      original_quantity: quantity,
      rate: unit_rate,
      section_id,
      approved_amount: quantity * unit_rate,
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'boq_items',
    entityId: item.id,
    after: { boq_version_id: boqVersionId, item_number, description, unit, original_quantity: quantity, rate: unit_rate },
  });

  redirect(`/cost-and-boq/boq/${contractId}`);
});
