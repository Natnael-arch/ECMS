import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
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
  const auth = await requireApiPermission('document.manage', projectId);
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

  const documents = await db.documents.findMany({
    where: { project_id: projectId },
    ...paginationArgs,
  });

  return NextResponse.json(paginateResult(documents, paginationArgs.take - 1));
});

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });
  const auth = await requireApiPermission('document.manage', projectId);
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const document_number = (form.get('document_number') as string)?.trim();
  const title = (form.get('title') as string)?.trim();
  const document_type = (form.get('document_type') as string)?.trim() || 'other';
  const revision_number = (form.get('revision_number') as string)?.trim() || 'A';
  const file_id = (form.get('file_id') as string)?.trim();

  if (!document_number || !title) {
    return NextResponse.json({ error: 'document_number and title are required' }, { status: 400 });
  }

  const existing = await db.documents.findFirst({
    where: { project_id: projectId, document_number },
  });
  if (existing) {
    return NextResponse.json({ error: `Document number ${document_number} already exists` }, { status: 409 });
  }

  const document = await db.documents.create({
    data: {
      project_id: projectId,
      document_number,
      title,
      category: document_type,
      status: 'draft',
      created_by: userId,
      metadata: { revision_number },
    },
  });

  if (file_id) {
    await db.document_revisions.create({
      data: {
        document_id: document.id,
        revision_number,
        title,
        file_id,
        status: 'draft',
        is_current: true,
        created_by: userId,
      },
    });
  }

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'documents',
    entityId: document.id,
    after: { document_number, title, category: document_type, status: 'draft' },
  });

  return NextResponse.json(document, { status: 201 });
});
