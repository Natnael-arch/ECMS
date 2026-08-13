import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { IconCurrencyDollar } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { money, num } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function CostCodesPage() {
  await requireAppUser();
  const { tenantId, projectId } = await getProjectContext();

  const costCodes = await db.cost_codes.findMany({
    where: { project_id: projectId ?? undefined },
    orderBy: { cost_code: 'asc' },
  });

  const [labor, materials] = await Promise.all([
    db.timesheet_lines.groupBy({ by: ['cost_code_id'], where: { cost_code_id: { not: null }, timesheet: { status: { in: ['approved', 'included_in_payroll'] }, project: { tenant_id: tenantId } } }, _sum: { gross_amount: true } }),
    db.material_issue_lines.groupBy({
      by: ['material_issue_id'],
      where: { material_issues: { status: 'posted', project: { tenant_id: tenantId } } },
      _sum: { unit_cost_snapshot: true },
    }).then(async (rows) => {
      const byCode = new Map<string, number>();
      const lines = await db.material_issue_lines.findMany({
        where: { material_issues: { status: 'posted', project: { tenant_id: tenantId } } },
        select: { unit_cost_snapshot: true, issued_quantity: true, material_issues: { select: { cost_code_id: true } } },
      });
      for (const l of lines) {
        if (l.material_issues.cost_code_id) {
          byCode.set(l.material_issues.cost_code_id, (byCode.get(l.material_issues.cost_code_id) ?? 0) + Number(l.issued_quantity) * Number(l.unit_cost_snapshot));
        }
      }
      return byCode;
    }),
  ]);

  const laborByCode = new Map(labor.map((r) => [r.cost_code_id ?? '', Number(r._sum.gross_amount ?? 0)]));

  const totalBudget = costCodes.reduce((s, c) => s + Number(c.budget_amount), 0);
  const totalSpend = costCodes.reduce((s, c) => s + (laborByCode.get(c.id) ?? 0) + (materials.get(c.id) ?? 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Cost Codes & Budget" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5">
          <p className="text-sm text-ecms-muted">Total Budget</p>
          <p className="mt-1 text-2xl font-bold text-ecms-text">{money(totalBudget)}</p>
        </div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5">
          <p className="text-sm text-ecms-muted">Spend (labor + materials)</p>
          <p className="mt-1 text-2xl font-bold text-ecms-amber">{money(totalSpend)}</p>
        </div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5">
          <p className="text-sm text-ecms-muted">Remaining</p>
          <p className="mt-1 text-2xl font-bold text-ecms-success">{money(totalBudget - totalSpend)}</p>
        </div>
      </div>

      <Card title="Cost Code Register" icon={<IconCurrencyDollar size={18} />}>
        {costCodes.length === 0 ? (
          <EmptyState title="No cost codes" message="Cost codes are created per project during setup or import." />
        ) : (
          <Table>
            <THead><TH>Code</TH><TH>Name</TH><TH>Category</TH><TH className="text-right">Budget</TH><TH className="text-right">Labor</TH><TH className="text-right">Materials</TH><TH className="text-right">Total Spend</TH><TH className="text-right">Utilization</TH></THead>
            <TBody>
              {costCodes.map((c) => {
                const laborAmt = laborByCode.get(c.id) ?? 0;
                const matAmt = materials.get(c.id) ?? 0;
                const spend = laborAmt + matAmt;
                const budget = Number(c.budget_amount);
                const util = budget > 0 ? Math.round((spend / budget) * 100) : 0;
                return (
                  <TR key={c.id} className="hover:bg-ecms-elevated/40">
                    <TD className="font-medium">{c.cost_code}</TD>
                    <TD>{c.name}</TD>
                    <TD className="text-ecms-muted">{c.category}</TD>
                    <TD className="text-right">{money(budget)}</TD>
                    <TD className="text-right">{money(laborAmt)}</TD>
                    <TD className="text-right">{money(matAmt)}</TD>
                    <TD className="text-right font-medium">{money(spend)}</TD>
                    <TD className="text-right">
                      <span className={util > 100 ? 'font-semibold text-ecms-danger' : util > 80 ? 'font-semibold text-ecms-amber' : 'text-ecms-muted'}>{num(util, 0)}%</span>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
