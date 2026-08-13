import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import type { issue_severity, issue_status } from '@/lib/generated/prisma/client';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  await requireAppUser();
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const form = await req.formData();
  const issue_number = (form.get('issue_number') as string)?.trim();
  const title = (form.get('title') as string)?.trim();
  const issue_type = (form.get('issue_type') as string)?.trim() || 'other';
  const severity = (form.get('severity') as string) as issue_severity;
  const due_date = (form.get('due_date') as string) || null;

  if (!issue_number || !title || !issue_type) {
    return NextResponse.json({ error: 'issue_number, title and issue_type are required' }, { status: 400 });
  }

  const issue = await db.issues.create({
    data: {
      project_id: projectId,
      issue_number,
      title,
      issue_type,
      severity: severity ?? 'medium',
      status: 'open' as issue_status,
      due_date: due_date ? new Date(due_date) : null,
      created_by: userId,
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'issues',
    entityId: issue.id,
    after: { issue_number, title, issue_type, severity, due_date },
  });

  redirect('/issues');
}
