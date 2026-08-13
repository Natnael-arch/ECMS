import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { IconClock } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { money, date } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function DayworkPage() {
  await requireAppUser();
  const { tenantId, projectId } = await getProjectContext();

  const sheets = await db.daywork_sheets.findMany({
    where: projectId ? { project_id: projectId } : { project: { tenant_id: tenantId } },
    orderBy: { work_date: 'desc' },
    include: {
      contracts: { select: { contract_number: true } },
      work_packages: { select: { package_code: true } },
      _count: { select: { daywork_lines: true } },
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Daywork Sheets" />
      <Card icon={<IconClock size={18} />}>
        {sheets.length === 0 ? (
          <EmptyState title="No daywork sheets" message="Daywork sheets for variations and extra works appear here." />
        ) : (
          <Table>
            <THead><TH>Sheet</TH><TH>Contract</TH><TH>Package</TH><TH>Work Date</TH><TH>Description</TH><TH>Status</TH><TH className="text-right">Total Amount</TH><TH>Lines</TH></THead>
            <TBody>
              {sheets.map((s) => (
                <TR key={s.id} className="hover:bg-ecms-elevated/40">
                  <TD className="font-medium">{s.sheet_number}</TD>
                  <TD className="text-ecms-muted">{s.contracts.contract_number}</TD>
                  <TD className="text-ecms-muted">{s.work_packages?.package_code ?? '—'}</TD>
                  <TD>{date(s.work_date)}</TD>
                  <TD className="max-w-[260px] truncate">{s.description}</TD>
                  <TD><StatusPill status={s.status} /></TD>
                  <TD className="text-right font-medium">{money(Number(s.total_amount))}</TD>
                  <TD>{s._count.daywork_lines}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
