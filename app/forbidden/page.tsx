import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconLock } from '@tabler/icons-react';

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ecms-bg">
      <div className="w-full max-w-md p-6">
        <EmptyState
          icon={<IconLock size={36} />}
          title="Access denied"
          message="Your role does not have permission to view this page. Contact your administrator if you believe this is an error."
          action={<Link href="/dashboard" className="rounded-lg bg-ecms-amber px-4 py-2 text-sm font-semibold text-ecms-navy hover:bg-ecms-amber/90">Back to dashboard</Link>}
        />
      </div>
    </div>
  );
}
