import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireApiPermission, assertSegregationOfDuty } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();

  const auth = await requireApiPermission('invoice.match', projectId);
  if (auth instanceof NextResponse) return auth;

  const invoice = await db.supplier_invoices.findUnique({ where: { id } });
  if (!invoice) return NextResponse.json({ error: 'Supplier invoice not found' }, { status: 404 });
  if (invoice.project_id !== projectId) {
    return NextResponse.json({ error: 'Invoice does not belong to this project' }, { status: 403 });
  }

  const sodBlocked = await assertSegregationOfDuty(
    userId,
    invoice.recorded_by,
    'The user who recorded an invoice cannot also approve it',
    { tenantId, projectId, entityType: 'supplier_invoices', entityId: id, target: 'approved_for_payment' }
  );
  if (sodBlocked) return sodBlocked;

  if (invoice.status !== 'draft' && invoice.status !== 'submitted' && invoice.status !== 'matched') {
    return NextResponse.json(
      { error: `Cannot approve invoice in status '${invoice.status}'` },
      { status: 409 }
    );
  }

  // Validate a passed three-way match exists
  const passedMatch = await db.three_way_matches.findFirst({
    where: { supplier_invoice_id: id, status: 'passed' },
  });
  if (!passedMatch) {
    return NextResponse.json(
      { error: 'A passed three-way match is required before approval' },
      { status: 409 }
    );
  }

  const updated = await db.supplier_invoices.update({
    where: { id },
    data: {
      status: 'approved_for_payment',
      approved_by: userId,
      approved_at: new Date(),
    },
  });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'APPROVE',
    entityType: 'supplier_invoices',
    entityId: id,
    before: { status: invoice.status },
    after: { status: 'approved_for_payment', approved_by: userId },
  });

  return NextResponse.json({ ok: true, status: updated.status });
});
