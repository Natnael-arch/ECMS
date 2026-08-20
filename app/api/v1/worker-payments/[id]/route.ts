import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { projectId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const auth = await requireApiPermission('worker_payment.record', projectId);
  if (auth instanceof NextResponse) return auth;

  const payment = await db.worker_payments.findUnique({
    where: { id },
    include: {
      payroll_lines: {
        include: {
          workers: {
            select: { id: true, display_name: true, worker_number: true, trade: true },
          },
          payroll_batches: {
            select: { id: true, payroll_number: true, status: true, period_start: true, period_end: true },
          },
        },
      },
      app_users: { select: { id: true, display_name: true } },
    },
  });

  if (!payment) return NextResponse.json({ error: 'Worker payment not found' }, { status: 404 });

  return NextResponse.json(payment);
});
