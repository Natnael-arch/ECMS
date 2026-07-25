'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/ui/Logo';
import { 
  IconLayoutDashboard, 
  IconBuilding, 
  IconCalendarEvent, 
  IconCurrencyDollar, 
  IconBox, 
  IconFileText,
  IconSettings,
  IconUser
} from '@tabler/icons-react';

const ALL_NAV_ITEMS = [
  { href: '/dashboard', icon: IconLayoutDashboard, label: 'Dashboard', roles: ['pm'] },
  { href: '/projects', icon: IconBuilding, label: 'Projects', roles: ['pm'] },
  { href: '/planning', icon: IconCalendarEvent, label: 'Planning', roles: ['pm', 'supervisor'] },
  { href: '/cost', icon: IconCurrencyDollar, label: 'Cost', roles: ['pm'] },
  { href: '/materials', icon: IconBox, label: 'Materials', roles: ['pm', 'supervisor', 'storekeeper'] },
  { href: '/documents', icon: IconFileText, label: 'Documents', roles: ['pm'] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  
  const userRole = session?.user?.role as string || '';

  const navItems = ALL_NAV_ITEMS.filter(item => item.roles.includes(userRole));

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-[56px] h-screen bg-ecms-navy border-r border-ecms-border shrink-0 fixed top-0 left-0 z-40">
        <div className="h-[48px] flex items-center justify-center border-b border-ecms-border mb-4">
          <Link href="/dashboard" className="flex justify-center items-center scale-75 hover:opacity-80 transition-opacity">
            <Logo variant="mark" />
          </Link>
        </div>
        
        <nav className="flex-1 flex flex-col items-center gap-4 py-2">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link 
                key={item.href} 
                href={item.href}
                title={item.label}
                className="relative w-full flex justify-center py-2 group"
              >
                {isActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-[2.5px] bg-ecms-amber rounded-r-sm" />
                )}
                <item.icon 
                  size={24} 
                  stroke={1.5}
                  className={cn(
                    "transition-colors",
                    isActive ? "text-ecms-amber" : "text-ecms-muted group-hover:text-ecms-text"
                  )} 
                />
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col items-center gap-4 pb-4">
          <div className="w-8 h-px bg-ecms-border" />
          <button className="text-ecms-muted hover:text-ecms-text transition-colors" title="Settings">
            <IconSettings size={24} stroke={1.5} />
          </button>
          <button className="text-ecms-muted hover:text-ecms-text transition-colors" title="Profile">
            <IconUser size={24} stroke={1.5} />
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-ecms-navy border-t border-ecms-border flex items-center justify-around z-40 pb-safe">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className="relative flex flex-col items-center justify-center w-full h-full p-2 group"
            >
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2.5px] bg-ecms-amber rounded-b-sm" />
              )}
              <item.icon 
                size={22} 
                stroke={1.5}
                className={cn(
                  "transition-colors",
                  isActive ? "text-ecms-amber" : "text-ecms-muted group-hover:text-ecms-text"
                )} 
              />
            </Link>
          );
        })}
      </nav>
    </>
  );
}
