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

  if (importJob.status !== 'ready') {
    return NextResponse.json({ error: `Cannot commit import in status ${importJob.status}` }, { status: 409 });
  }

  const rows = await db.import_rows.findMany({
    where: { import_job_id: id, status: 'valid' },
    orderBy: { source_row_number: 'asc' },
  });

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No valid rows to commit' }, { status: 400 });
  }

  let committedCount = 0;
  let skippedCount = 0;

  await db.$transaction(async (tx) => {
    await tx.import_jobs.update({
      where: { id },
      data: { status: 'committing', started_at: new Date() },
    });

    for (const row of rows) {
      const data = (row.normalized_data ?? row.source_data) as Record<string, unknown>;

      try {
        if (importJob.import_kind === 'boq') {
          const boqItem = await tx.boq_items.create({
            data: {
              boq_version_id: (data.boq_version_id as string) || '',
              item_number: (data.item_number as string) || `IMP-${row.source_row_number}`,
              description: (data.description as string) || 'Imported item',
              unit: (data.unit as string) || null,
              original_quantity: parseFloat(data.quantity as string) || 0,
              rate: parseFloat(data.unit_rate as string) || 0,
              section_id: (data.section_id as string) || null,
            },
          });

          await tx.import_rows.update({
            where: { id: row.id },
            data: {
              status: 'committed',
              target_entity: 'boq_items',
              target_id: boqItem.id,
              committed_at: new Date(),
            },
          });
          committedCount++;
        } else if (importJob.import_kind === 'measurements') {
          const contract_id = (data.contract_id as string) || '';
          if (!contract_id) {
            await tx.import_rows.update({
              where: { id: row.id },
              data: { status: 'error', error_count: (row.error_count || 0) + 1 },
            });
            await tx.import_exceptions.create({
              data: {
                import_job_id: id,
                import_row_id: row.id,
                severity: 'high',
                exception_code: 'MISSING_FIELD',
                message: 'contract_id is required for measurement imports',
              },
            });
            skippedCount++;
            continue;
          }

          const measurement = await tx.measurements.create({
            data: {
              project_id: projectId!,
              contract_id,
              measurement_number: (data.measurement_number as string) || `IMP-${row.source_row_number}`,
              measurement_date: new Date((data.measurement_date as string) || new Date()),
              status: 'draft',
              created_by: userId,
            },
          });

          await tx.import_rows.update({
            where: { id: row.id },
            data: {
              status: 'committed',
              target_entity: 'measurements',
              target_id: measurement.id,
              committed_at: new Date(),
            },
          });
          committedCount++;
        } else if (importJob.import_kind === 'workers') {
          await tx.import_rows.update({
            where: { id: row.id },
            data: {
              status: 'skipped',
            },
          });
          skippedCount++;
        } else {
          await tx.import_rows.update({
            where: { id: row.id },
            data: { status: 'skipped' },
          });
          skippedCount++;
        }
      } catch {
        await tx.import_rows.update({
          where: { id: row.id },
          data: { status: 'error', error_count: (row.error_count || 0) + 1 },
        });

        await tx.import_exceptions.create({
          data: {
            import_job_id: id,
            import_row_id: row.id,
            severity: 'critical',
            exception_code: 'COMMIT_FAILED',
            message: 'Failed to commit row',
          },
        });
        skippedCount++;
      }
    }

    const finalStatus = skippedCount > 0 ? 'completed_with_exceptions' : 'completed';
    await tx.import_jobs.update({
      where: { id },
      data: {
        status: finalStatus as any,
        completed_at: new Date(),
        statistics: { committed: committedCount, skipped: skippedCount, total: rows.length },
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
    after: { status: 'completed', committed: committedCount, skipped: skippedCount },
  });

  return NextResponse.json({
    status: skippedCount > 0 ? 'completed_with_exceptions' : 'completed',
    committed: committedCount,
    skipped: skippedCount,
  });
});
