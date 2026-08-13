import React from 'react';
import { cn } from '@/lib/utils';

const base = 'w-full rounded-lg border border-ecms-border-strong bg-ecms-elevated px-3 py-2.5 text-sm text-ecms-text outline-none transition-colors placeholder:text-ecms-muted/60 focus:border-ecms-amber disabled:opacity-60';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...rest }: InputProps) {
  return <input className={cn(base, className)} {...rest} />;
}
