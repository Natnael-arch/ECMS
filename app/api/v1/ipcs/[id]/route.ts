import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import type { ipc_status } from '@/lib/generated/prisma/client';
import { db } from '@/lib/db';
import { requireApiPermission, IPC_TARGET_PERMISSIONS, assertSegregationOfDuty } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { withErrorHandling } from '@/lib/api-handler';
import { notifyProjectMembers } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

const transitions: Record<ipc_status, ipc_status[]> = {
  draft: ['submitted'],
  submitted: ['under_review', 'returned'],
  under_review: ['recommended', 'returned'],
  returned: ['submitted', 'cancelled'],
  recommended: ['certified', 'returned'],
  certified: ['paid'],
  paid: [],
  cancelled: [],
};

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();
  if (!projectId) return NextResponse.json({ error: 'No project selected' }, { status: 400 });

  const ipc = await db.ipc_certificates.findUnique({ where: { id } });
  if (!ipc) return NextResponse.json({ error: 'IPC not found' }, { status: 404 });

  const form = await req.formData();
  const target = (form.get('status') as string) as ipc_status;

  const requiredPermission = IPC_TARGET_PERMISSIONS[target];
  if (!requiredPermission) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const auth = await requireApiPermission(requiredPermission, projectId);
  if (auth instanceof NextResponse) return auth;

  const allowed = transitions[ipc.status];
  if (!allowed.includes(target)) {
    return NextResponse.json({ error: `Invalid transition ${ipc.status} -> ${target}` }, { status: 409 });
  }

  const now = new Date();
  const data: {
    status: ipc_status;
    submitted_by?: string;
    submitted_at?: Date;
    recommended_by?: string;
    recommended_at?: Date;
    certified_by?: string;
    certified_at?: Date;
    paid_at?: Date;
    paid_by?: string;
  } = { status: target };

  if (target === 'submitted') {
    data.submitted_by = userId;
    data.submitted_at = now;
  } else if (target === 'recommended') {
    data.recommended_by = userId;
    data.recommended_at = now;
  } else if (target === 'certified') {
    data.certified_by = userId;
    data.certified_at = now;
  } else if (target === 'paid') {
    const blocked = await assertSegregationOfDuty(
      userId,
      ipc.certified_by,
      'The user who certified an IPC cannot also record its payment',
      { tenantId, projectId, entityType: 'ipc_certificates', entityId: ipc.id, target }
    );
    if (blocked) return blocked;
    data.paid_by = userId;
    data.paid_at = now;
  }

  await db.ipc_certificates.update({ where: { id }, data });

  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'UPDATE',
    entityType: 'ipc_certificates',
    entityId: ipc.id,
    before: { status: ipc.status },
    after: { status: target },
  });

  const ipcRef = ipc.certificate_reference || `IPC #${ipc.ipc_number}`;
  if (projectId) {
    if (target === 'submitted') {
      await notifyProjectMembers(
        tenantId, projectId, 'ipc.review',
        'IPC submitted for review',
        `${ipcRef} has been submitted and is ready for review.`,
        'action_required', 'ipc_certificates', ipc.id
      );
    } else if (target === 'recommended') {
      await notifyProjectMembers(
        tenantId, projectId, 'ipc.certify',
        'IPC recommended for certification',
        `${ipcRef} has been recommended and requires certification.`,
        'action_required', 'ipc_certificates', ipc.id
      );
    } else if (target === 'returned') {
      await notifyProjectMembers(
        tenantId, projectId, 'ipc.prepare',
        'IPC returned for revision',
        `${ipcRef} has been returned and requires revision.`,
        'action_required', 'ipc_certificates', ipc.id
      );
    } else if (target === 'certified') {
      await notifyProjectMembers(
        tenantId, projectId, 'payment.record',
        'IPC certified — ready for payment',
        `${ipcRef} has been certified and is ready for payment recording.`,
        'info', 'ipc_certificates', ipc.id
      );
    }
  }

  redirect(`/ipcs/${ipc.id}`);
});
