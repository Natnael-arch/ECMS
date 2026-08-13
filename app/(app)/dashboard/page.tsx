import Link from 'next/link';
import { KpiCard } from '@/components/ui/KpiCard';
import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  IconBuilding,
  IconCash,
  IconFileInvoice,
  IconAlertTriangle,
  IconBell,
  IconPackages,
} from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { money, date, num } from '@/lib/format';
import { SCurve } from '@/components/charts/SCurve';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const ctx = await requireAppUser();
  const { projectId, tenantId } = await getProjectContext();
  const tenant = await db.tenants.findUnique({ where: { id: tenantId } });
  const currency = tenant?.default_currency ?? 'ETB';

  const [projects, contracts, ipcs, notifications, issues, stock, costCodes] = await Promise.all([
    db.projects.findMany({ orderBy: { created_at: 'asc' } }),
    db.contracts.findMany({ where: { project_id: projectId ?? undefined }, orderBy: { contract_number: 'asc' } }),
    db.ipc_certificates.findMany({
      where: { project_id: projectId ?? undefined },
      orderBy: { period_end: 'desc' },
      take: 8,
      include: { contracts: { select: { contract_number: true, title: true } } },
    }),
    db.notifications.findMany({ where: { user_id: ctx.appUser.id }, orderBy: { created_at: 'desc' }, take: 6 }),
    db.issues.findMany({ where: { project_id: projectId ?? undefined, status: { notIn: ['resolved', 'closed'] } }, orderBy: { created_at: 'desc' }, take: 6, include: { app_users_issues_assigned_toToapp_users: { select: { display_name: true } } } }),
    db.$queryRaw<Array<{ item_code: string; description: string; unit: string; qty_on_hand: number; minimum_stock: number; warehouse_code: string }>>`
      SELECT s.item_code, s.description, s.unit, s.qty_on_hand, s.minimum_stock, s.warehouse_code
      FROM ecms.v_stock_on_hand s
      WHERE s.project_id = ${projectId ?? ''} AND s.qty_on_hand < s.minimum_stock
      ORDER BY (s.minimum_stock - s.qty_on_hand) DESC LIMIT 6`,
    db.cost_codes.groupBy({ by: ['project_id'], where: { project_id: projectId ?? undefined }, _sum: { budget_amount: true } }),
  ]);

  const totalContractValue = contracts.reduce((s, c) => s + Number(c.revised_contract_amount), 0);
  const certifiedToDate = ipcs.reduce((s, i) => s + Number(i.net_current_amount), 0);
  const paidToDate = await db.payments.aggregate({ where: { ipc: { project_id: projectId ?? undefined } }, _sum: { net_paid_amount: true } });
  const budgetConsumed = costCodes.reduce((s, c) => s + Number(c._sum.budget_amount ?? 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Active Projects" value={projects.length} subtitle={`${contracts.length} contracts on file`} icon={<IconBuilding size={20} />} />
        <KpiCard title="Contract Value" value={money(totalContractValue, currency)} subtitle="Revised contract amounts" icon={<IconCash size={20} />} />
        <KpiCard title="Certified to Date" value={money(certifiedToDate, currency)} subtitle={`${paidToDate._sum.net_paid_amount ? money(Number(paidToDate._sum.net_paid_amount), currency) : money(0, currency)} paid`} icon={<IconFileInvoice size={20} />} />
        <KpiCard title="Open Issues" value={issues.length} subtitle="Issues awaiting resolution" icon={<IconAlertTriangle size={20} />} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card title="S-Curve & Progress" subtitle="Certified vs planned trend (illustrative)" className="xl:col-span-2">
          <SCurve height={220} />
        </Card>
        <Card title="Notifications" icon={<IconBell size={18} />} className="flex flex-col">
          <div className="flex flex-col divide-y divide-ecms-border">
            {notifications.length === 0 && <EmptyState title="No notifications" message="Workflow events will appear here." />}
            {notifications.map((n) => (
              <div key={n.id} className="flex flex-col gap-0.5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ecms-text">{n.title}</span>
                  <span className="text-[10px] uppercase tracking-wide text-ecms-muted shrink-0">{date(n.created_at)}</span>
                </div>
                {n.body && <p className="text-xs text-ecms-muted line-clamp-2">{n.body}</p>}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card
          title="Recent Interim Payment Certificates"
          actions={<Link href="/ipcs" className="text-xs font-semibold text-ecms-amber hover:underline">View all</Link>}
        >
          {ipcs.length === 0 ? (
            <EmptyState icon={<IconFileInvoice size={28} />} title="No IPCs yet" message="Certified interim payment certificates will appear here." />
          ) : (
            <Table>
              <THead><TH>IPC</TH><TH>Contract</TH><TH>Period End</TH><TH className="text-right">Net</TH><TH>Status</TH></THead>
              <TBody>
                {ipcs.map((ipc) => (
                  <TR key={ipc.id} className="hover:bg-ecms-elevated/40">
                    <TD className="font-medium"><Link className="hover:text-ecms-amber" href={`/ipcs/${ipc.id}`}>IPC {ipc.ipc_number}</Link></TD>
                    <TD className="text-ecms-muted">{ipc.contracts.contract_number}</TD>
                    <TD>{date(ipc.period_end)}</TD>
                    <TD className="text-right font-medium">{money(Number(ipc.net_current_amount), ipc.currency)}</TD>
                    <TD><StatusPill status={ipc.status} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card title="Open Issues" actions={<Link href="/issues" className="text-xs font-semibold text-ecms-amber hover:underline">Issue register</Link>}>
          {issues.length === 0 ? (
            <EmptyState icon={<IconAlertTriangle size={28} />} title="No open issues" message="All issues are resolved." />
          ) : (
            <Table>
              <THead><TH>Number</TH><TH>Title</TH><TH>Assignee</TH><TH>Due</TH><TH>Status</TH></THead>
              <TBody>
                {issues.map((issue) => (
                  <TR key={issue.id} className="hover:bg-ecms-elevated/40">
                    <TD className="font-medium">{issue.issue_number}</TD>
                    <TD className="max-w-[260px] truncate">{issue.title}</TD>
                    <TD className="text-ecms-muted">{issue.app_users_issues_assigned_toToapp_users?.display_name ?? 'Unassigned'}</TD>
                    <TD>{date(issue.due_date)}</TD>
                    <TD><StatusPill status={issue.status} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      <Card title="Stock Alerts" subtitle="Items below minimum stock level" icon={<IconPackages size={18} />}>
        <SectionHeader title="Inventory" />
        {stock.length === 0 ? (
          <EmptyState title="No stock alerts" message="All items are at or above their minimum stock level." />
        ) : (
          <Table>
            <THead><TH>Warehouse</TH><TH>Item Code</TH><TH>Description</TH><TH className="text-right">On Hand</TH><TH className="text-right">Minimum</TH><TH className="text-right">Shortfall</TH></THead>
            <TBody>
              {stock.map((row, i) => (
                <TR key={i} className="hover:bg-ecms-elevated/40">
                  <TD className="text-ecms-muted">{row.warehouse_code}</TD>
                  <TD className="font-medium">{row.item_code}</TD>
                  <TD className="max-w-[280px] truncate">{row.description}</TD>
                  <TD className="text-right">{num(row.qty_on_hand)}</TD>
                  <TD className="text-right">{num(row.minimum_stock)}</TD>
                  <TD className="text-right text-ecms-danger font-medium">{num(Number(row.minimum_stock) - Number(row.qty_on_hand))}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
