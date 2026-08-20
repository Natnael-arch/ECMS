import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const PUT = withErrorHandling(async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });
  const auth = await requireApiPermission('import.manage', projectId);
  if (auth instanceof NextResponse) return auth;

  const importJob = await db.import_jobs.findUnique({ where: { id } });
  if (!importJob) return NextResponse.json({ error: 'Import job not found' }, { status: 404 });

  if (!['uploaded', 'mapping'].includes(importJob.status)) {
    return NextResponse.json({ error: `Cannot set mappings for import in status ${importJob.status}` }, { status: 409 });
  }

  const body = await req.json();
  const mappings = body.mappings as Array<{ source_column: string; target_field: string }>;

  if (!Array.isArray(mappings) || mappings.length === 0) {
    return NextResponse.json({ error: 'mappings must be a non-empty array' }, { status: 400 });
  }

  await db.$transaction(async (tx) => {
    await tx.import_mappings.deleteMany({ where: { import_job_id: id } });

    await tx.import_mappings.createMany({
      data: mappings.map((m) => ({
        import_job_id: id,
        target_entity: importJob.import_kind,
        mapping_name: m.target_field,
        mapping: { source_column: m.source_column, target_field: m.target_field },
        created_by: userId,
      })),
    });

    await tx.import_jobs.update({
      where: { id },
      data: { status: 'mapping' },
    });
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'UPDATE',
    entityType: 'import_jobs',
    entityId: importJob.id,
    before: { status: importJob.status },
    after: { status: 'mapping', mapping_count: mappings.length },
  });

  return NextResponse.json({ status: 'mapping', count: mappings.length });
});
