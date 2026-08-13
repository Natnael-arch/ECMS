import React from 'react';
import { cn } from '@/lib/utils';

export function LoadingState({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-3 py-14 text-sm text-ecms-muted', className)}>
      <span className="h-4 w-4 rounded-full border-2 border-ecms-border-strong border-t-ecms-amber animate-spin" />
      {label}
    </div>
  );
}
