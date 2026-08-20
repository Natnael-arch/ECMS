import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });
  const auth = await requireApiPermission('timesheet.prepare', projectId);
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const timesheet_number = (form.get('timesheet_number') as string)?.trim();
  const period_start = (form.get('period_start') as string) || null;
  const period_end = (form.get('period_end') as string) || null;
  const worker_id = (form.get('worker_id') as string)?.trim();
  const work_date = (form.get('work_date') as string) || null;
  const regular_hours = Number(form.get('regular_hours') ?? 0);

  if (!timesheet_number || !worker_id || !period_start || !period_end) {
    return NextResponse.json({ error: 'timesheet_number, worker_id, period_start and period_end are required' }, { status: 400 });
  }

  const worker = await db.workers.findFirst({ where: { id: worker_id, project_id: projectId } });
  if (!worker) return NextResponse.json({ error: 'Invalid worker' }, { status: 400 });

  const regularRate = Number(worker.regular_hourly_rate);
  const overtimeRate = Number(worker.overtime_hourly_rate);

  const timesheet = await db.timesheets.create({
    data: {
      project_id: projectId,
      timesheet_number,
      period_start: new Date(period_start),
      period_end: new Date(period_end),
      status: 'draft',
      timesheet_lines: {
        create: [
          {
            worker_id,
            work_date: work_date ? new Date(work_date) : new Date(period_start),
            regular_hours: Number.isNaN(regular_hours) ? 0 : regular_hours,
            overtime_hours: 0,
            regular_rate_snapshot: regularRate,
            overtime_rate_snapshot: overtimeRate,
            gross_amount: (Number.isNaN(regular_hours) ? 0 : regular_hours) * regularRate,
          },
        ],
      },
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'timesheets',
    entityId: timesheet.id,
    after: { timesheet_number, period_start, period_end, worker_id },
  });

  redirect('/workforce/timesheets');
});
