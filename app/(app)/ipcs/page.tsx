import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { IconFileInvoice } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { money, date } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function IpcsPage() {
  await requireAppUser();
  const { tenantId, projectId } = await getProjectContext();

  const ipcs = await db.ipc_certificates.findMany({
    where: projectId ? { project_id: projectId } : { projects: { tenant_id: tenantId } },
    orderBy: [{ contract_id: 'asc' }, { ipc_number: 'desc' }],
    include: {
      contracts: { select: { contract_number: true, title: true } },
      ipc_lines: { select: { id: true } },
    },
  });

  const totals = ipcs.reduce(
    (acc, i) => {
      acc.work += Number(i.current_work_amount);
      acc.mos += Number(i.current_mos_amount);
      acc.gross += Number(i.current_gross_amount);
      acc.net += Number(i.net_current_amount);
      acc.retention += Number(i.current_retention);
      return acc;
    },
    { work: 0, mos: 0, gross: 0, net: 0, retention: 0 }
  );

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Interim Payment Certificates" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5"><p className="text-sm text-ecms-muted">IPCs</p><p className="mt-1 text-2xl font-bold text-ecms-text">{ipcs.length}</p></div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5"><p className="text-sm text-ecms-muted">Work Certified</p><p className="mt-1 text-2xl font-bold text-ecms-text">{money(totals.work)}</p></div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5"><p className="text-sm text-ecms-muted">Materials on Site</p><p className="mt-1 text-2xl font-bold text-ecms-text">{money(totals.mos)}</p></div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5"><p className="text-sm text-ecms-muted">Net Certified</p><p className="mt-1 text-2xl font-bold text-ecms-amber">{money(totals.net)}</p></div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5"><p className="text-sm text-ecms-muted">Retention Held</p><p className="mt-1 text-2xl font-bold text-ecms-danger">{money(totals.retention)}</p></div>
      </div>

      <Card icon={<IconFileInvoice size={18} />}>
        {ipcs.length === 0 ? (
          <EmptyState title="No IPCs" message="Interim payment certificates appear here once generated against a contract." />
        ) : (
          <Table>
            <THead><TH>IPC</TH><TH>Contract</TH><TH>Period</TH><TH>Status</TH><TH className="text-right">Work</TH><TH className="text-right">MOS</TH><TH className="text-right">Gross</TH><TH className="text-right">Retention</TH><TH className="text-right">Net</TH><TH>Lines</TH></THead>
            <TBody>
              {ipcs.map((ipc) => (
                <TR key={ipc.id} className="hover:bg-ecms-elevated/40">
                  <TD className="font-medium">
                    <Link className="hover:text-ecms-amber" href={`/ipcs/${ipc.id}`}>IPC {ipc.ipc_number}</Link>
                  </TD>
                  <TD className="text-ecms-muted">{ipc.contracts.contract_number}</TD>
                  <TD className="whitespace-nowrap">{date(ipc.period_start)} – {date(ipc.period_end)}</TD>
                  <TD><StatusPill status={ipc.status} /></TD>
                  <TD className="text-right">{money(Number(ipc.current_work_amount), ipc.currency)}</TD>
                  <TD className="text-right">{money(Number(ipc.current_mos_amount), ipc.currency)}</TD>
                  <TD className="text-right">{money(Number(ipc.current_gross_amount), ipc.currency)}</TD>
                  <TD className="text-right">{money(Number(ipc.current_retention), ipc.currency)}</TD>
                  <TD className="text-right font-medium">{money(Number(ipc.net_current_amount), ipc.currency)}</TD>
                  <TD>{ipc.ipc_lines.length}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
