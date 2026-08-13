import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { IconPlus, IconRuler } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { date } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function FieldMeasurementsPage() {
  const ctx = await requireAppUser();
  const { tenantId, projectId } = await getProjectContext();

  const [measurements, contracts, workPackages, orgs] = await Promise.all([
    db.measurements.findMany({
      where: projectId ? { project_id: projectId } : { project: { tenant_id: tenantId } },
      orderBy: { measurement_date: 'desc' },
      include: {
        contracts: { select: { contract_number: true } },
        work_packages: { select: { package_code: true } },
        _count: { select: { measurement_lines: true } },
      },
    }),
    db.contracts.findMany({ where: projectId ? { project_id: projectId } : { project: { tenant_id: tenantId } }, select: { id: true, contract_number: true } }),
    db.work_packages.findMany({ where: projectId ? { project_id: projectId } : { project: { tenant_id: tenantId } }, select: { id: true, package_code: true } }),
    db.organizations.findMany({ where: { tenant_id: tenantId }, select: { id: true, short_name: true } }),
  ]);

  const nextNumber = measurements.length + 1;

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Field Measurements" />

      <Card title="New Measurement" icon={<IconRuler size={18} />}>
        <form method="POST" action="/api/v1/measurements" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input name="measurement_number" defaultValue={`MS-${String(nextNumber).padStart(3, '0')}`} className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" placeholder="Number" />
          <input name="measurement_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" />
          <select name="contract_id" required className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text">
            <option value="">Select contract…</option>
            {contracts.map((c) => <option key={c.id} value={c.id}>{c.contract_number}</option>)}
          </select>
          <select name="work_package_id" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text">
            <option value="">Work package (optional)</option>
            {workPackages.map((w) => <option key={w.id} value={w.id}>{w.package_code}</option>)}
          </select>
          <select name="contractor_org_id" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text">
            <option value="">Contractor (optional)</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.short_name ?? o.legal_name}</option>)}
          </select>
          <input name="summary" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" placeholder="Summary (optional)" />
          <div className="sm:col-span-2 lg:col-span-2 flex items-end">
            <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-ecms-amber px-3 py-1.5 text-sm font-semibold text-ecms-navy hover:bg-ecms-amber/90">
              <IconPlus size={16} /> Create Measurement
            </button>
          </div>
        </form>
      </Card>

      <Card title="Measurement Register" icon={<IconRuler size={18} />}>
        {measurements.length === 0 ? (
          <EmptyState title="No measurements" message="Field measurement sheets will appear here once created." />
        ) : (
          <Table>
            <THead><TH>Number</TH><TH>Contract</TH><TH>Package</TH><TH>Date</TH><TH>Status</TH><TH>Rev</TH><TH>Lines</TH></THead>
            <TBody>
              {measurements.map((m) => (
                <TR key={m.id} className="hover:bg-ecms-elevated/40">
                  <TD className="font-medium">{m.measurement_number}</TD>
                  <TD className="text-ecms-muted">{m.contracts.contract_number}</TD>
                  <TD className="text-ecms-muted">{m.work_packages?.package_code ?? '—'}</TD>
                  <TD>{date(m.measurement_date)}</TD>
                  <TD><StatusPill status={m.status} /></TD>
                  <TD>{m.revision_number}</TD>
                  <TD>{m._count.measurement_lines}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
