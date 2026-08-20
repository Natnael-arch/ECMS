import { notFound } from 'next/navigation';
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

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAppUser();
  const { projectId } = await getProjectContext();

  const document = await db.documents.findUnique({
    where: { id },
    include: {
      contracts: { select: { contract_number: true } },
    },
  });

  if (!document) notFound();

  const revisions = await db.document_revisions.findMany({
    where: { document_id: id },
    orderBy: { revision_number: 'desc' },
    include: {
      app_users: { select: { display_name: true } },
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title={document.document_number}
        actions={
          document.status === 'draft' ? (
            <form method="POST" action={`/api/v1/documents/${document.id}`}>
              <input type="hidden" name="action" value="issue" />
              <button type="submit" className="rounded-lg bg-ecms-amber px-4 py-2 text-sm font-semibold text-ecms-navy hover:bg-ecms-amber/90">
                Issue Document
              </button>
            </form>
          ) : (
            <StatusPill status={document.status} />
          )
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card title="Document Info" icon={<IconFiles size={18} />}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-ecms-muted">Document Number</dt><dd className="font-medium">{document.document_number}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Title</dt><dd className="font-medium truncate max-w-[180px]">{document.title}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Category</dt><dd className="font-medium">{document.category}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Discipline</dt><dd className="font-medium">{document.discipline ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Status</dt><dd><StatusPill status={document.status} /></dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Contract</dt><dd className="font-medium">{document.contracts?.contract_number ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Confidentiality</dt><dd className="font-medium">{document.confidentiality}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Created</dt><dd className="font-medium">{date(document.created_at)}</dd></div>
          </dl>
        </Card>

        <Card title="Current Revision" bodyClassName="pt-3">
          {revisions.length > 0 ? (() => {
            const current = revisions.find((r) => r.is_current) ?? revisions[0];
            return (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-ecms-muted">Revision</dt><dd className="font-bold text-lg text-ecms-amber">{current.revision_number}</dd></div>
                <div className="flex justify-between"><dt className="text-ecms-muted">Status</dt><dd><StatusPill status={current.status} /></dd></div>
                <div className="flex justify-between"><dt className="text-ecms-muted">Issued</dt><dd className="font-medium">{date(current.issued_date)}</dd></div>
                <div className="flex justify-between"><dt className="text-ecms-muted">Purpose</dt><dd className="font-medium">{current.issue_purpose ?? '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-ecms-muted">Pages</dt><dd className="font-medium">{current.page_count ?? '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-ecms-muted">OCR</dt><dd className="font-medium">{current.ocr_status}</dd></div>
                <div className="flex justify-between"><dt className="text-ecms-muted">Created by</dt><dd className="font-medium">{current.app_users?.display_name ?? '—'}</dd></div>
              </dl>
            );
          })() : (
            <p className="text-sm text-ecms-muted">No revisions yet.</p>
          )}
        </Card>

        <Card title="Summary" bodyClassName="pt-3">
          <dl className="grid grid-cols-1 gap-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-ecms-muted">Total Revisions</dt><dd className="font-bold text-lg text-ecms-text">{revisions.length}</dd></div>
            <div className="flex justify-between"><dt className="text-ecms-muted">Issued Revisions</dt><dd className="font-medium">{revisions.filter((r) => r.issued_date).length}</dd></div>
          </dl>
        </Card>
      </div>

      <Card title="Revision History" icon={<IconFiles size={18} />}>
        {revisions.length === 0 ? (
          <EmptyState title="No revisions" message="Document revisions appear here once uploaded." />
        ) : (
          <Table>
            <THead><TH>Revision</TH><TH>Status</TH><TH>Issued</TH><TH>Purpose</TH><TH>Pages</TH><TH>OCR</TH><TH>Created by</TH><TH>Actions</TH></THead>
            <TBody>
              {revisions.map((r) => (
                <TR key={r.id} className="hover:bg-ecms-elevated/40">
                  <TD className="font-medium">{r.revision_number}</TD>
                  <TD><StatusPill status={r.status} /></TD>
                  <TD>{date(r.issued_date)}</TD>
                  <TD className="text-ecms-muted">{r.issue_purpose ?? '—'}</TD>
                  <TD>{r.page_count ?? '—'}</TD>
                  <TD className="text-ecms-muted">{r.ocr_status}</TD>
                  <TD className="text-ecms-muted">{r.app_users?.display_name ?? '—'}</TD>
                  <TD>
                    {r.status === 'draft' && (
                      <form method="POST" action={`/api/v1/document-revisions/${r.id}/issue`}>
                        <input type="hidden" name="action" value="issue" />
                        <button type="submit" className="text-xs font-semibold text-ecms-amber hover:underline">
                          Issue
                        </button>
                      </form>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card title="Add Revision">
        <form method="POST" action={`/api/v1/documents/${document.id}/revisions`} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input name="revision_number" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" placeholder="Revision number (e.g. Rev A)" required />
          <input name="title" defaultValue={document.title} className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" placeholder="Title" />
          <input name="issue_purpose" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" placeholder="Issue purpose (optional)" />
          <input name="page_count" type="number" min="0" className="rounded-lg border border-ecms-border bg-ecms-bg px-3 py-1.5 text-sm text-ecms-text" placeholder="Page count" />
          <div className="sm:col-span-2 lg:col-span-4 flex items-end">
            <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-ecms-amber px-3 py-1.5 text-sm font-semibold text-ecms-navy hover:bg-ecms-amber/90">
              Add Revision
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
