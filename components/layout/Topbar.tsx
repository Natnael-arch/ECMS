'use client';
import React from 'react';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { IconBell, IconLogout } from '@tabler/icons-react';

export function Topbar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  // Extract page title from pathname
  const getPageTitle = () => {
    const titleMap: Record<string, string> = {
      '/dashboard': 'Executive dashboard',
      '/projects': 'Project management',
      '/planning': 'Planning & progress',
      '/cost': 'Cost control',
      '/materials': 'Material & warehouse',
      '/documents': 'Document management'
    };
    
    const matchedPath = Object.keys(titleMap).find(key => pathname.startsWith(key));
    if (matchedPath) return titleMap[matchedPath];
    
    const path = pathname.split('/')[1];
    if (!path) return '';
    return path.charAt(0).toUpperCase() + path.slice(1);
  };

  return (
    <header className="h-[48px] bg-ecms-navy border-b border-ecms-border flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center">
        <h1 className="text-ecms-text text-[14px] font-medium">{getPageTitle()}</h1>
      </div>
      
      <div className="flex items-center gap-4">
        <button className="relative text-ecms-muted hover:text-ecms-text transition-colors">
          <IconBell size={20} stroke={1.5} />
          <span className="absolute top-0 right-0 w-2 h-2 bg-ecms-danger rounded-full border border-ecms-navy" />
        </button>
        
        <div className="w-px h-5 bg-ecms-border" />
        
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-ecms-elevated text-ecms-amber text-xs font-bold shadow-sm border border-ecms-border-strong uppercase">
            {session?.user?.name?.charAt(0) || 'U'}
          </div>
          <button 
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-ecms-muted hover:text-ecms-text transition-colors"
            title="Sign out"
          >
            <IconLogout size={18} stroke={1.5} />
          </button>
        </div>
      </div>
    </header>
  );
}
