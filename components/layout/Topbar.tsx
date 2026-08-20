'use client';

import { usePathname } from 'next/navigation';
import { useSession, signOut } from '@/lib/auth-client';
import { IconBell, IconLogout } from '@tabler/icons-react';
import { getNavigationTrail } from '@/lib/navigation';

export function Topbar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const trail = getNavigationTrail(pathname);
  const title = trail?.item.label ?? trail?.module.label ?? 'Engineering & Construction Management System';
  return <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-ecms-border bg-ecms-navy px-6 pl-14 md:pl-6"><div className="min-w-0"><p className="hidden text-[10px] uppercase tracking-wider text-ecms-muted sm:block">{trail?.module.label ?? 'ECMS'}</p><h1 className="truncate text-sm font-medium text-ecms-text">{title}</h1></div><div className="flex items-center gap-4"><button className="relative text-ecms-muted hover:text-ecms-text" aria-label="Notifications"><IconBell size={20} stroke={1.5} /><span className="absolute right-0 top-0 h-2 w-2 rounded-full border border-ecms-navy bg-ecms-danger" /></button><div className="h-5 w-px bg-ecms-border" /><div className="flex items-center gap-3"><div className="flex h-7 w-7 items-center justify-center rounded-full border border-ecms-border-strong bg-ecms-elevated text-xs font-bold uppercase text-ecms-amber">{session?.user?.name?.charAt(0) || 'U'}</div><button onClick={() => signOut({ fetchOptions: { onSuccess: () => { window.location.href = '/login'; } } })} className="text-ecms-muted hover:text-ecms-text" title="Sign out"><IconLogout size={18} stroke={1.5} /></button></div></div></header>;
}