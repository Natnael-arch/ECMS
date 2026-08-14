import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import type { ipc_status } from '@/lib/generated/prisma/client';
import { db } from '@/lib/db';
import { requireApiPermission, IPC_TARGET_PERMISSIONS } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';

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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();

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

  redirect(`/ipcs/${ipc.id}`);
}
