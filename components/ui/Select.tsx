import React from 'react';
import { cn } from '@/lib/utils';

const base = 'w-full rounded-lg border border-ecms-border-strong bg-ecms-elevated px-3 py-2.5 text-sm text-ecms-text outline-none transition-colors focus:border-ecms-amber disabled:opacity-60 appearance-none';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, children, ...rest }: SelectProps) {
  return (
    <div className="relative">
      <select className={cn(base, 'pr-8', className)} {...rest}>
        {children}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ecms-muted text-xs">▼</span>
    </div>
  );
}
