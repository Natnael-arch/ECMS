import { NextRequest, NextResponse } from 'next/server';
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
  const auth = await requireApiPermission('import.manage', projectId);
  if (auth instanceof NextResponse) return auth;

  const importJob = await db.import_jobs.findUnique({ where: { id } });
  if (!importJob) return NextResponse.json({ error: 'Import job not found' }, { status: 404 });

  if (!['mapping', 'uploaded'].includes(importJob.status)) {
    return NextResponse.json({ error: `Cannot validate import in status ${importJob.status}` }, { status: 409 });
  }

  const rows = await db.import_rows.findMany({
    where: { import_job_id: id },
    orderBy: { source_row_number: 'asc' },
  });

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No rows to validate' }, { status: 400 });
  }

  const mappings = await db.import_mappings.findMany({
    where: { import_job_id: id },
  });

  let validCount = 0;
  let errorCount = 0;
  const exceptions: Array<{ import_row_id: string; message: string; severity: string; field_name?: string }> = [];

  await db.$transaction(async (tx) => {
    for (const row of rows) {
      const sourceData = row.source_data as Record<string, unknown>;
      const normalizedData: Record<string, unknown> = {};
      let rowErrors = 0;

      for (const mapping of mappings) {
        const mappingData = mapping.mapping as Record<string, string>;
        const sourceColumn = mappingData.source_column;
        const targetField = mappingData.target_field;

        if (sourceColumn && sourceColumn in sourceData) {
          normalizedData[targetField] = sourceData[sourceColumn];
        } else if (targetField) {
          rowErrors++;
          exceptions.push({
            import_row_id: row.id,
            message: `Missing required column: ${sourceColumn}`,
            severity: 'error',
            field_name: sourceColumn,
          });
        }
      }

      const hasValue = Object.values(normalizedData).some((v) => v !== null && v !== undefined && v !== '');
      if (!hasValue && Object.keys(normalizedData).length === 0) {
        rowErrors++;
        exceptions.push({
          import_row_id: row.id,
          message: 'Row contains no valid data after mapping',
          severity: 'error',
        });
      }

      const rowStatus = rowErrors > 0 ? 'error' : 'valid';
      if (rowErrors > 0) errorCount++;
      else validCount++;

      await tx.import_rows.update({
        where: { id: row.id },
        data: {
          status: rowStatus as any,
          normalized_data: normalizedData as any,
          error_count: rowErrors,
        },
      });
    }

    if (exceptions.length > 0) {
      await tx.import_exceptions.createMany({
        data: exceptions.map((e) => ({
          import_job_id: id,
          import_row_id: e.import_row_id,
          severity: e.severity as any,
          exception_code: 'MAPPING_ERROR',
          field_name: e.field_name ?? null,
          message: e.message,
          source_value: null,
          suggested_value: null,
        })),
      });
    }

    const jobStatus = errorCount > 0 ? 'exceptions' : 'ready';
    await tx.import_jobs.update({
      where: { id },
      data: {
        status: jobStatus as any,
        statistics: { valid: validCount, errors: errorCount, total: rows.length },
      },
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
    after: { status: errorCount > 0 ? 'exceptions' : 'ready', valid: validCount, errors: errorCount },
  });

  return NextResponse.json({
    status: errorCount > 0 ? 'exceptions' : 'ready',
    valid: validCount,
    errors: errorCount,
    total: rows.length,
  });
});
