import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import type { contract_status } from '@/lib/generated/prisma/client';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { getCursorPaginationArgs, paginateResult } from '@/lib/pagination';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const { projectId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });
  const auth = await requireApiPermission('contract.manage', projectId);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get('cursor') ?? undefined;
  const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined;
  const orderParam = searchParams.get('order');

  let orderBy: Record<string, 'asc' | 'desc'> = { created_at: 'desc' };
  if (orderParam) {
    const [field, dir] = orderParam.split(':');
    if (field && (dir === 'asc' || dir === 'desc')) {
      orderBy = { [field]: dir };
    }
  }

  const paginationArgs = getCursorPaginationArgs({ cursor, limit, orderBy });

  const contracts = await db.contracts.findMany({
    where: { project_id: projectId },
    ...paginationArgs,
  });

  return NextResponse.json(paginateResult(contracts, paginationArgs.take - 1));
});

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });
  const auth = await requireApiPermission('contract.manage', projectId);
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const contract_number = (form.get('contract_number') as string)?.trim();
  const title = (form.get('title') as string)?.trim();
  const contract_type = (form.get('contract_type') as string)?.trim() || null;
  const currency = (form.get('currency') as string)?.trim() || 'ETB';
  const original_contract_amount = parseFloat(form.get('original_contract_amount') as string) || 0;
  const revised_contract_amount = parseFloat(form.get('revised_contract_amount') as string) || 0;

  if (!contract_number || !title) {
    return NextResponse.json({ error: 'contract_number and title are required' }, { status: 400 });
  }

  const contract = await db.contracts.create({
    data: {
      project_id: projectId,
      contract_number,
      title,
      contract_type,
      currency,
      original_contract_amount,
      revised_contract_amount,
      status: 'draft',
      created_by: userId,
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'contracts',
    entityId: contract.id,
    after: { contract_number, title, contract_type, currency, status: 'draft' },
  });

  redirect(`/contracts`);
});
