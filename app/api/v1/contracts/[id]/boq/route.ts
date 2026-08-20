import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: contractId } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });
  const auth = await requireApiPermission('boq.manage', projectId);
  if (auth instanceof NextResponse) return auth;

  const contract = await db.contracts.findUnique({ where: { id: contractId } });
  if (!contract) return NextResponse.json({ error: 'Contract not found' }, { status: 404 });

  const form = await req.formData();
  const version_number = parseInt(form.get('version_number') as string, 10);

  if (!version_number || version_number < 1) {
    return NextResponse.json({ error: 'version_number must be a positive integer' }, { status: 400 });
  }

  const boqVersion = await db.boq_versions.create({
    data: {
      contract_id: contractId,
      version_number,
      name: `BOQ v${version_number}`,
      status: 'draft',
      currency: contract.currency,
      created_by: userId,
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'boq_versions',
    entityId: boqVersion.id,
    after: { contract_id: contractId, version_number, status: 'draft' },
  });

  return NextResponse.json(boqVersion, { status: 201 });
});
