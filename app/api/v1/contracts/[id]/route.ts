import { NextRequest, NextResponse } from 'next/server';
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
  const auth = await requireApiPermission('contract.manage', projectId);
  if (auth instanceof NextResponse) return auth;

  const contract = await db.contracts.findUnique({
    where: { id },
    include: {
      boq_versions: true,
      variations: {
        orderBy: { created_at: 'desc' },
      },
    },
  });

  if (!contract) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
  }

  return NextResponse.json(contract);
});

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });
  const auth = await requireApiPermission('contract.manage', projectId);
  if (auth instanceof NextResponse) return auth;

  const existing = await db.contracts.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Contract not found' }, { status: 404 });

  const form = await req.formData();
  const updates: Record<string, unknown> = {};
  const allowedFields = [
    'title',
    'contract_type',
    'currency',
    'original_contract_amount',
    'revised_contract_amount',
    'procurement_reference',
    'vat_percent',
    'retention_percent',
    'performance_security_percent',
    'advance_percent',
    'price_adjustment_ceiling_percent',
    'minimum_ipc_amount',
  ] as const;

  for (const field of allowedFields) {
    const val = form.get(field);
    if (val !== null) {
      if (
        field === 'original_contract_amount' ||
        field === 'revised_contract_amount' ||
        field === 'vat_percent' ||
        field === 'retention_percent' ||
        field === 'performance_security_percent' ||
        field === 'advance_percent' ||
        field === 'price_adjustment_ceiling_percent' ||
        field === 'minimum_ipc_amount'
      ) {
        updates[field] = parseFloat(val as string) || 0;
      } else {
        updates[field] = (val as string)?.trim() || null;
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const contract = await db.contracts.update({ where: { id }, data: updates });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'UPDATE',
    entityType: 'contracts',
    entityId: contract.id,
    before: { title: existing.title, status: existing.status },
    after: { ...updates },
  });

  return NextResponse.json(contract);
});
