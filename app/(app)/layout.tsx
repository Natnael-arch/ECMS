import React from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { getProjectContext } from '@/lib/server/context';
import { hasPermission } from '@/lib/server/session';
import { ChatWidget } from '@/components/ai/ChatWidget';

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let projectId: string | null = null;
  let canUseAiChat = false;

  try {
    const ctx = await getProjectContext();
    projectId = ctx.projectId;
    if (projectId) {
      canUseAiChat = await hasPermission('ai_chat.use', { projectId });
    }
  } catch {
    // Unauthenticated or context error fallback
    canUseAiChat = false;
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar />
      <div className="flex-1 flex flex-col md:pl-60 min-h-screen">
        <Topbar />
        <main className="flex-1 p-5 overflow-auto">
          {children}
        </main>
        {canUseAiChat && projectId && <ChatWidget projectId={projectId} />}
        <footer className="py-3 text-center text-xs text-steel border-t border-hairline">
          ECMS · Engineering & Construction Management System · © 2026
        </footer>
      </div>
    </div>
  );
}
