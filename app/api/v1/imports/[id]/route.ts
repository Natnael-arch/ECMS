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
  const auth = await requireApiPermission('import.manage', projectId);
  if (auth instanceof NextResponse) return auth;

  const importJob = await db.import_jobs.findUnique({
    where: { id },
    include: {
      import_rows: {
        orderBy: { source_row_number: 'asc' },
      },
      import_mappings: true,
      import_exceptions: {
        orderBy: { created_at: 'desc' },
      },
    },
  });

  if (!importJob) {
    return NextResponse.json({ error: 'Import job not found' }, { status: 404 });
  }

  return NextResponse.json(importJob);
});
