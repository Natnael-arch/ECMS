import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });
  const auth = await requireApiPermission('variation.create', projectId);
  if (auth instanceof NextResponse) return auth;

  const existing = await db.variations.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Variation not found' }, { status: 404 });
  if (existing.status !== 'draft') {
    return NextResponse.json({ error: 'Can only edit a draft variation' }, { status: 409 });
  }

  const form = await req.formData();
  const updates: Record<string, unknown> = {};

  const title = (form.get('title') as string)?.trim();
  if (title) updates.title = title;

  const description = (form.get('description') as string)?.trim();
  if (description !== undefined) updates.description = description || null;

  const variation_type = (form.get('variation_type') as string)?.trim();
  if (variation_type) updates.reason_code = variation_type;

  const variation_number = (form.get('variation_number') as string)?.trim();
  if (variation_number) updates.variation_number = variation_number;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const variation = await db.variations.update({ where: { id }, data: updates });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'UPDATE',
    entityType: 'variations',
    entityId: variation.id,
    before: { title: existing.title, description: existing.description },
    after: updates,
  });

  return NextResponse.json(variation);
});
