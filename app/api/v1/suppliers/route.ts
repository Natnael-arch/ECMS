import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { tenantId, projectId, userId } = await getProjectContext();
  const auth = await requireApiPermission('supplier.manage', projectId);
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const organization_id = (form.get('organization_id') as string)?.trim();
  const supplier_code = (form.get('supplier_code') as string)?.trim();
  const categories = (form.get('categories') as string)
    ?.split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  const tax_clearance_expiry = (form.get('tax_clearance_expiry') as string) || null;

  if (!organization_id || !supplier_code) {
    return NextResponse.json({ error: 'organization_id and supplier_code are required' }, { status: 400 });
  }

  const organization = await db.organizations.findFirst({ where: { id: organization_id, tenant_id: tenantId } });
  if (!organization) return NextResponse.json({ error: 'Invalid organization' }, { status: 400 });

  const supplier = await db.suppliers.create({
    data: {
      tenant_id: tenantId,
      organization_id,
      supplier_code,
      status: 'draft',
      categories: categories ?? [],
      tax_clearance_expiry: tax_clearance_expiry ? new Date(tax_clearance_expiry) : null,
      created_by: userId,
    },
  });

  await writeAudit({
    tenantId,
    actorUserId: userId,
    action: 'CREATE',
    entityType: 'suppliers',
    entityId: supplier.id,
    after: { supplier_code, organization_id, categories },
  });

  redirect('/procurement');
}
