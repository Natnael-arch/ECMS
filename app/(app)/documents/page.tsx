import { Card } from '@/components/ui/Card';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { IconFiles } from '@tabler/icons-react';
import { db } from '@/lib/db';
import { requireAppUser } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { date } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  await requireAppUser();
  const { tenantId, projectId } = await getProjectContext();

  const [register, revisions] = await Promise.all([
    db.$queryRaw<Array<{ document_id: string; document_number: string; title: string; category: string; discipline: string | null; status: string; current_revision_id: string | null; revision_number: string | null; issued_date: Date | null; issue_purpose: string | null; page_count: number | null; ocr_status: string | null }>>`
      SELECT document_id, document_number, title, category, discipline, status, current_revision_id, revision_number, issued_date, issue_purpose, page_count, ocr_status
      FROM ecms.v_document_register WHERE project_id = ${projectId ?? ''} ORDER BY document_number ASC`,
    db.document_revisions.count({ where: { documents: { project_id: projectId ?? undefined } } }),
  ]);

  const categories = new Map<string, number>();
  for (const d of register) categories.set(d.category, (categories.get(d.category) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Document Control" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5"><p className="text-sm text-ecms-muted">Documents</p><p className="mt-1 text-2xl font-bold text-ecms-text">{register.length}</p></div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5"><p className="text-sm text-ecms-muted">Revisions</p><p className="mt-1 text-2xl font-bold text-ecms-amber">{revisions}</p></div>
        <div className="rounded-xl border border-ecms-border bg-ecms-card p-5">
          <p className="text-sm text-ecms-muted">Categories</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {[...categories.entries()].slice(0, 6).map(([cat, count]) => (
              <span key={cat} className="rounded-full bg-ecms-elevated px-2 py-0.5 text-xs text-ecms-muted">{cat} ({count})</span>
            ))}
          </div>
        </div>
      </div>

      <Card icon={<IconFiles size={18} />}>
        {register.length === 0 ? (
          <EmptyState title="No documents" message="Document revisions uploaded and issued appear here." />
        ) : (
          <Table>
            <THead><TH>Document Number</TH><TH>Title</TH><TH>Category</TH><TH>Discipline</TH><TH>Status</TH><TH>Current Rev</TH><TH>Issued</TH><TH>Purpose</TH><TH className="text-right">Pages</TH></THead>
            <TBody>
              {register.map((d) => (
                <TR key={d.document_id} className="hover:bg-ecms-elevated/40">
                  <TD className="font-medium whitespace-nowrap">{d.document_number}</TD>
                  <TD className="max-w-[260px] truncate">{d.title}</TD>
                  <TD className="text-ecms-muted">{d.category}</TD>
                  <TD className="text-ecms-muted">{d.discipline ?? '—'}</TD>
                  <TD><StatusPill status={d.status} /></TD>
                  <TD className="font-medium">{d.revision_number ?? '—'}</TD>
                  <TD>{date(d.issued_date)}</TD>
                  <TD className="text-ecms-muted">{d.issue_purpose ?? '—'}</TD>
                  <TD className="text-right">{d.page_count ?? '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
