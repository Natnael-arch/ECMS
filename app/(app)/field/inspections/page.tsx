import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Badge } from '@/components/ui/Badge';
import { IconClipboardCheck } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { dateTime, date } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function InspectionsPage() {
  await requireAppUser();
  const { tenantId, projectId } = await getProjectContext();

  const inspections = await db.inspection_requests.findMany({
    where: projectId ? { project_id: projectId } : { projects: { tenant_id: tenantId } },
    orderBy: { requested_for: 'desc' },
    include: {
      contracts: { select: { contract_number: true } },
      work_packages: { select: { package_code: true } },
      boq_items: { select: { item_number: true } },
      app_users_inspection_requests_inspector_idToapp_users: { select: { display_name: true } },
      _count: { select: { inspection_check_items: true } },
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Inspection Requests" />
      <Card icon={<IconClipboardCheck size={18} />}>
        {inspections.length === 0 ? (
          <EmptyState title="No inspection requests" message="Inspection and test requests will appear here." />
        ) : (
          <Table>
            <THead><TH>Number</TH><TH>Subject</TH><TH>Contract</TH><TH>Package</TH><TH>BOQ Item</TH><TH>Inspector</TH><TH>Requested For</TH><TH>Status</TH><TH>Result</TH><TH>Checks</TH></THead>
            <TBody>
              {inspections.map((i) => (
                <TR key={i.id} className="hover:bg-ecms-elevated/40">
                  <TD className="font-medium">{i.inspection_number}</TD>
                  <TD className="max-w-[240px] truncate">{i.subject}</TD>
                  <TD className="text-ecms-muted">{i.contracts?.contract_number ?? '—'}</TD>
                  <TD className="text-ecms-muted">{i.work_packages?.package_code ?? '—'}</TD>
                  <TD className="text-ecms-muted">{i.boq_items?.item_number ?? '—'}</TD>
                  <TD className="text-ecms-muted">{i.app_users_inspection_requests_inspector_idToapp_users?.display_name ?? '—'}</TD>
                  <TD>{i.requested_for ? dateTime(i.requested_for) : '—'}</TD>
                  <TD><StatusPill status={i.status} /></TD>
                  <TD>
                    <Badge tone={i.result === 'accepted' ? 'success' : i.result === 'rejected' ? 'danger' : i.result === 'accepted_with_comments' ? 'warning' : 'neutral'}>{i.result}</Badge>
                  </TD>
                  <TD>{i._count.inspection_check_items}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
