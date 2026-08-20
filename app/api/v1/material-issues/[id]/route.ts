import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import type { material_issue_status } from '@/lib/generated/prisma/client';
import { db } from '@/lib/db';
import { requireApiPermission, assertSegregationOfDuty } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

const transitions: Record<material_issue_status, material_issue_status[]> = {
  draft: ['submitted'],
  submitted: ['approved', 'returned'],
  approved: ['posted'],
  posted: [],
  returned: ['submitted'],
  cancelled: [],
};

const TARGET_PERMISSIONS: Record<string, string> = {
  submitted: 'inventory.issue',
  approved: 'inventory.issue',
  posted: 'inventory.issue',
  returned: 'inventory.issue',
};

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const issue = await db.material_issues.findUnique({ where: { id } });
  if (!issue) return NextResponse.json({ error: 'Material issue not found' }, { status: 404 });

  const form = await req.formData();
  const target = form.get('status') as material_issue_status;

  const requiredPermission = TARGET_PERMISSIONS[target];
  if (!requiredPermission) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const auth = await requireApiPermission(requiredPermission, projectId);
  if (auth instanceof NextResponse) return auth;

  const allowed = transitions[issue.status];
  if (!allowed.includes(target)) {
    return NextResponse.json(
      { error: `Invalid transition ${issue.status} -> ${target}` },
      { status: 409 }
    );
  }

  const now = new Date();
  const data: {
    status: material_issue_status;
    approved_by?: string;
    approved_at?: Date;
    issued_by?: string;
    posted_at?: Date;
  } = { status: target };

  if (target === 'approved') {
    const blocked = await assertSegregationOfDuty(
      userId,
      issue.requested_by,
      'The user who requested a material issue cannot also approve it',
      { tenantId, projectId, entityType: 'material_issues', entityId: issue.id, target }
    );
    if (blocked) return blocked;
    data.approved_by = userId;
    data.approved_at = now;
  } else if (target === 'posted') {
    const blockedIssuer = await assertSegregationOfDuty(
      userId,
      issue.received_by,
      'The user who received materials cannot also issue them',
      { tenantId, projectId, entityType: 'material_issues', entityId: issue.id, target }
    );
    if (blockedIssuer) return blockedIssuer;

    data.issued_by = userId;
    data.posted_at = now;
  }

  await db.material_issues.update({ where: { id }, data });

  if (target === 'posted') {
    const lines = await db.material_issue_lines.findMany({
      where: { material_issue_id: id },
    });

    if (lines.length > 0) {
      await db.stock_ledger_entries.createMany({
        data: lines.map((line) => ({
          project_id: issue.project_id,
          warehouse_id: issue.warehouse_id,
          inventory_item_id: line.inventory_item_id,
          entry_type: 'issue',
          quantity_delta: -line.issued_quantity,
          unit_cost: line.unit_cost_snapshot,
          value_delta: -Math.round(Number(line.issued_quantity) * Number(line.unit_cost_snapshot) * 10000) / 10000,
          source_type: 'material_issue',
          source_id: issue.id,
          source_line_id: line.id,
          occurred_at: issue.posted_at || now,
          posted_by: userId,
          notes: `Automatically posted from material issue ${issue.issue_number}`,
        })),
      });
    }
  }

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'UPDATE',
    entityType: 'material_issues',
    entityId: issue.id,
    before: { status: issue.status },
    after: { status: target },
  });

  redirect('/stores/issues');
});
