import React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary: 'bg-ecms-amber text-ecms-navy hover:bg-opacity-90 font-bold',
  secondary: 'border border-ecms-border-strong text-ecms-text hover:bg-ecms-elevated font-medium',
  ghost: 'text-ecms-muted hover:text-ecms-text font-medium',
  danger: 'bg-ecms-danger/10 text-ecms-danger border border-ecms-danger/30 hover:bg-ecms-danger/20 font-semibold',
  success: 'bg-ecms-success/10 text-ecms-success border border-ecms-success/30 hover:bg-ecms-success/20 font-semibold',
};

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
}

export function Button({ variant = 'primary', size = 'md', icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-ecms-amber/60',
        variants[variant],
        sizes[size],
        className
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
