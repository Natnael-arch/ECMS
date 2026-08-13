import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

export function Card({ title, subtitle, icon, actions, className, bodyClassName, children }: CardProps) {
  return (
    <div className={cn('bg-ecms-card border border-ecms-border rounded-xl flex flex-col overflow-hidden', className)}>
      {(title || actions) && (
        <div className="p-5 border-b border-ecms-border flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {icon && <div className="text-ecms-amber mt-0.5 shrink-0">{icon}</div>}
            <div>
              <h2 className="text-base font-semibold text-ecms-text">{title}</h2>
              {subtitle && <p className="text-xs text-ecms-muted mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </div>
  );
}
