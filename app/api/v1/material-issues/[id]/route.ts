import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import type { material_issue_status } from '@/lib/generated/prisma/client';
import { db } from '@/lib/db';
import { requireApiPermission, assertSegregationOfDuty } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';

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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    if (issue.recipient_name && issue.recipient_name === auth.appUser.display_name) {
      await writeAudit({
        tenantId,
        projectId,
        actorUserId: userId,
        action: 'SOD_VIOLATION_BLOCKED',
        entityType: 'material_issues',
        entityId: issue.id,
        metadata: {
          detail: 'A storekeeper cannot issue material to themselves',
          requestedStatus: target,
        },
      });
      return NextResponse.json(
        {
          error: 'Segregation of duty violation',
          detail: 'A storekeeper cannot issue material to themselves',
        },
        { status: 409 }
      );
    }

    data.issued_by = userId;
    data.posted_at = now;
  }

  await db.material_issues.update({ where: { id }, data });

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
}
