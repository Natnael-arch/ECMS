import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });
  const auth = await requireApiPermission('document.issue', projectId);
  if (auth instanceof NextResponse) return auth;

  const revision = await db.document_revisions.findUnique({ where: { id } });
  if (!revision) return NextResponse.json({ error: 'Document revision not found' }, { status: 404 });

  if (revision.status !== 'draft') {
    return NextResponse.json({ error: `Cannot issue revision in status ${revision.status}` }, { status: 409 });
  }

  const form = await req.formData();
  const issue_purpose = (form.get('issue_purpose') as string)?.trim() || null;

  const now = new Date();
  const updated = await db.document_revisions.update({
    where: { id },
    data: {
      status: 'accepted',
      issued_date: now,
      issue_purpose,
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'UPDATE',
    entityType: 'document_revisions',
    entityId: revision.id,
    before: { status: revision.status },
    after: { status: 'accepted', issued_date: now },
  });

  redirect(`/documents/${revision.document_id}`);
});
