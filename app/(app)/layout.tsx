import React from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen bg-ecms-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col md:pl-[56px] pb-16 md:pb-0 min-h-screen">
        <Topbar />
        <main className="flex-1 p-5 overflow-auto">
          {children}
        </main>
        <footer className="py-3 text-center text-xs text-ecms-muted border-t border-ecms-border">
          ECMS · Engineering & Construction Management System · © 2026
        </footer>
      </div>
    </div>
  );
}
