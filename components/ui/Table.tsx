import React from 'react';
import { cn } from '@/lib/utils';

export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full text-left text-sm text-ecms-text', className)}>{children}</table>
    </div>
  );
}

export function THead({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <thead className={cn('bg-ecms-elevated/50 text-ecms-muted text-xs uppercase', className)}>
      <tr>{children}</tr>
    </thead>
  );
}

export function TH({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <th className={cn('px-5 py-3 font-medium', className)}>{children}</th>;
}

export function TBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <tbody className={cn('divide-y divide-ecms-border', className)}>{children}</tbody>;
}

export function TR({ className, children, ...rest }: { className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn('transition-colors', className)} {...rest}>
      {children}
    </tr>
  );
}

export function TD({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <td className={cn('px-5 py-4', className)}>{children}</td>;
}
