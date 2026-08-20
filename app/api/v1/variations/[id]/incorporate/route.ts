import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { variationTransitions } from '@/lib/transitions';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const variation = await db.variations.findUnique({ where: { id } });
  if (!variation) return NextResponse.json({ error: 'Variation not found' }, { status: 404 });

  const target = 'incorporated';
  const allowed = variationTransitions[variation.status];
  if (!allowed.includes(target)) {
    return NextResponse.json(
      { error: `Invalid transition ${variation.status} -> ${target}` },
      { status: 409 }
    );
  }

  const auth = await requireApiPermission('variation.approve', projectId);
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const incorporated_boq_version_id = (form.get('boq_version_id') as string)?.trim() || null;

  await db.variations.update({
    where: { id },
    data: {
      status: 'incorporated',
      incorporated_boq_version_id,
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'UPDATE',
    entityType: 'variations',
    entityId: id,
    before: { status: variation.status },
    after: { status: 'incorporated', incorporated_boq_version_id },
  });

  return NextResponse.json({ status: 'incorporated' });
});
