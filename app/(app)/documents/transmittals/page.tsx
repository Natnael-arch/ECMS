import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Badge } from '@/components/ui/Badge';
import { IconSwitchVertical } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { date } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function TransmittalsPage() {
  await requireAppUser();
  const { tenantId, projectId } = await getProjectContext();

  const transmittals = await db.transmittals.findMany({
    where: projectId ? { project_id: projectId } : { project: { tenant_id: tenantId } },
    orderBy: { sent_at: 'desc' },
    include: {
      contracts: { select: { contract_number: true } },
      organizations_transmittals_sender_org_idToorganizations: { select: { short_name: true } },
      organizations_transmittals_recipient_org_idToorganizations: { select: { short_name: true } },
      _count: { select: { transmittal_items: true } },
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Transmittals" />
      <Card icon={<IconSwitchVertical size={18} />}>
        {transmittals.length === 0 ? (
          <EmptyState title="No transmittals" message="Document transmittals in and out appear here." />
        ) : (
          <Table>
            <THead><TH>Number</TH><TH>Contract</TH><TH>Direction</TH><TH>Subject</TH><TH>From</TH><TH>To</TH><TH>Sent</TH><TH>Status</TH><TH>Items</TH></THead>
            <TBody>
              {transmittals.map((t) => (
                <TR key={t.id} className="hover:bg-ecms-elevated/40">
                  <TD className="font-medium">{t.transmittal_number}</TD>
                  <TD className="text-ecms-muted">{t.contracts?.contract_number ?? '—'}</TD>
                  <TD><Badge tone={t.direction === 'outgoing' ? 'info' : 'warning'}>{t.direction}</Badge></TD>
                  <TD className="max-w-[240px] truncate">{t.subject}</TD>
                  <TD className="text-ecms-muted">{t.organizations_transmittals_sender_org_idToorganizations?.short_name ?? '—'}</TD>
                  <TD className="text-ecms-muted">{t.organizations_transmittals_recipient_org_idToorganizations?.short_name ?? '—'}</TD>
                  <TD>{date(t.sent_at)}</TD>
                  <TD><StatusPill status={t.status} /></TD>
                  <TD>{t._count.transmittal_items}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
