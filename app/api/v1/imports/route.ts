import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });
  const auth = await requireApiPermission('import.manage', projectId);
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const import_type = (form.get('import_type') as string)?.trim();
  const file_name = (form.get('file_name') as string)?.trim();
  const source_file_id = (form.get('source_file_id') as string)?.trim();

  if (!import_type || !file_name) {
    return NextResponse.json({ error: 'import_type and file_name are required' }, { status: 400 });
  }

  if (!source_file_id) {
    return NextResponse.json({ error: 'source_file_id is required' }, { status: 400 });
  }

  const file = await db.stored_files.findUnique({ where: { id: source_file_id } });
  if (!file) return NextResponse.json({ error: 'Invalid source file' }, { status: 400 });

  const importJob = await db.import_jobs.create({
    data: {
      project_id: projectId,
      source_file_id,
      import_kind: import_type,
      status: 'uploaded',
      source_name: file_name,
      created_by: userId,
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'import_jobs',
    entityId: importJob.id,
    after: { import_kind: import_type, source_name: file_name, status: 'uploaded' },
  });

  return NextResponse.json(importJob, { status: 201 });
});
