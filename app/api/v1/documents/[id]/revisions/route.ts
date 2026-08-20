import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: documentId } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });
  const auth = await requireApiPermission('document.manage', projectId);
  if (auth instanceof NextResponse) return auth;

  const document = await db.documents.findUnique({ where: { id: documentId } });
  if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  const form = await req.formData();
  const revision_number = (form.get('revision_number') as string)?.trim();
  const title = (form.get('title') as string)?.trim() || document.title;
  const file_id = (form.get('file_id') as string)?.trim();
  const issue_purpose = (form.get('issue_purpose') as string)?.trim() || null;
  const page_count = form.get('page_count') ? parseInt(form.get('page_count') as string, 10) : null;

  if (!revision_number) {
    return NextResponse.json({ error: 'revision_number is required' }, { status: 400 });
  }

  const existing = await db.document_revisions.findFirst({
    where: { document_id: documentId, revision_number },
  });
  if (existing) {
    return NextResponse.json({ error: `Revision ${revision_number} already exists` }, { status: 409 });
  }

  const currentRevision = await db.document_revisions.findFirst({
    where: { document_id: documentId, is_current: true },
  });

  if (currentRevision) {
    await db.document_revisions.update({
      where: { id: currentRevision.id },
      data: { is_current: false },
    });
  }

  const revision = await db.document_revisions.create({
    data: {
      document_id: documentId,
      revision_number,
      title,
      file_id: file_id || currentRevision?.file_id || '',
      status: 'draft',
      is_current: true,
      created_by: userId,
      issue_purpose,
      page_count,
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'document_revisions',
    entityId: revision.id,
    after: { document_id: documentId, revision_number, status: 'draft' },
  });

  redirect(`/documents/${documentId}`);
});
