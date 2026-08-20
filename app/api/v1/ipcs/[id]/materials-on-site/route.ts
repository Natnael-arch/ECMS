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

  const auth = await requireApiPermission('ipc.prepare', projectId);
  if (auth instanceof NextResponse) return auth;

  const ipc = await db.ipc_certificates.findUnique({ where: { id } });
  if (!ipc) return NextResponse.json({ error: 'IPC not found' }, { status: 404 });

  const materials = await db.ipc_materials_on_site.findMany({
    where: { ipc_id: id },
    orderBy: { line_number: 'asc' },
  });

  return NextResponse.json(materials);
});

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const auth = await requireApiPermission('ipc.prepare', projectId);
  if (auth instanceof NextResponse) return auth;

  const ipc = await db.ipc_certificates.findUnique({ where: { id } });
  if (!ipc) return NextResponse.json({ error: 'IPC not found' }, { status: 404 });
  if (ipc.locked_at) {
    return NextResponse.json({ error: 'Cannot add materials on site to a locked IPC' }, { status: 409 });
  }

  const form = await req.formData();
  const description = form.get('description') as string | null;
  const quantityRaw = form.get('quantity') as string | null;
  const unit = form.get('unit') as string | null;
  const unitRateRaw = form.get('unit_rate') as string | null;
  const deliveryDate = form.get('delivery_date') as string | null;
  const invoiceNumber = form.get('invoice_number') as string | null;
  const recoveryFlag = form.get('recovery_flag') as string | null;
  const eligibilityPercentRaw = form.get('eligibility_percent') as string | null;

  if (!description || description.trim().length === 0) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 });
  }
  if (!quantityRaw || isNaN(Number(quantityRaw))) {
    return NextResponse.json({ error: 'quantity is required and must be a valid number' }, { status: 400 });
  }
  if (!unit || unit.trim().length === 0) {
    return NextResponse.json({ error: 'unit is required' }, { status: 400 });
  }
  if (!unitRateRaw || isNaN(Number(unitRateRaw))) {
    return NextResponse.json({ error: 'unit_rate is required and must be a valid number' }, { status: 400 });
  }

  const quantity = Number(quantityRaw);
  const unitRate = Number(unitRateRaw);
  const grossValue = quantity * unitRate;
  const isRecovery = recoveryFlag === 'true';
  const eligibilityPercent = eligibilityPercentRaw ? Number(eligibilityPercentRaw) : 100;
  const eligibleValue = grossValue * (eligibilityPercent / 100);

  // Determine next line_number
  const lastMOS = await db.ipc_materials_on_site.findFirst({
    where: { ipc_id: id },
    orderBy: { line_number: 'desc' },
  });
  const nextLine = (lastMOS?.line_number ?? 0) + 1;

  const mosEntry = await db.ipc_materials_on_site.create({
    data: {
      ipc_id: id,
      line_number: nextLine,
      description: description.trim(),
      invoice_number: invoiceNumber || null,
      delivery_date: deliveryDate ? new Date(deliveryDate) : null,
      gross_value: grossValue,
      eligibility_percent: eligibilityPercent,
      eligible_value: eligibleValue,
      current_recovery: isRecovery ? eligibleValue : 0,
      current_credit: isRecovery ? 0 : eligibleValue,
      cumulative_certified: 0,
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'ipc_materials_on_site',
    entityId: mosEntry.id,
    after: {
      ipc_id: id,
      description,
      gross_value: grossValue,
      eligible_value: eligibleValue,
      is_recovery: isRecovery,
    },
  });

  return NextResponse.json(mosEntry, { status: 201 });
});
