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
  const auth = await requireApiPermission('document.read', projectId);
  if (auth instanceof NextResponse) return auth;

  const document = await db.documents.findUnique({ where: { id } });
  if (!document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const revisions = await db.document_revisions.findMany({
    where: { document_id: id },
    orderBy: { created_at: 'desc' },
  });

  return NextResponse.json({ ...document, revisions });
});

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) redirect(`/documents/${id}`);
  const auth = await requireApiPermission('document.issue', projectId);
  if (auth instanceof NextResponse) redirect(`/documents/${id}`);

  const form = await req.formData();
  const action = form.get('action') as string;

  if (action === 'issue') {
    const currentRevision = await db.document_revisions.findFirst({
      where: { document_id: id, is_current: true },
    });

    if (currentRevision) {
      const now = new Date();
      await db.document_revisions.update({
        where: { id: currentRevision.id },
        data: { status: 'accepted', issued_date: now },
      });

      await db.documents.update({
        where: { id },
        data: { status: 'active' },
      });

      await writeAudit({
        tenantId,
        projectId,
        actorUserId: userId,
        action: 'UPDATE',
        entityType: 'documents',
        entityId: id,
        before: { status: 'draft' },
        after: { status: 'active' },
      });
    }
  }

  redirect(`/documents/${id}`);
});
