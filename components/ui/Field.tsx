import React from 'react';
import { cn } from '@/lib/utils';

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, hint, error, optional, children, className }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm text-ecms-muted font-medium">
        {label}
        {optional && <span className="text-ecms-muted/60 font-normal"> (optional)</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-ecms-muted/70">{hint}</p>}
      {error && <p className="text-xs text-ecms-danger">{error}</p>}
    </div>
  );
}
