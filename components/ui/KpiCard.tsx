import React from 'react';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  className?: string;
}

export function KpiCard({ title, value, subtitle, icon, trend, className }: KpiCardProps) {
  return (
    <div className={cn("bg-ecms-card border border-ecms-border rounded-xl p-5 flex flex-col gap-2", className)}>
      <div className="flex justify-between items-start">
        <span className="text-ecms-muted text-sm font-medium">{title}</span>
        {icon && <div className="text-ecms-amber">{icon}</div>}
      </div>
      <div className="flex items-end gap-3 mt-1">
        <span className="text-2xl font-bold text-ecms-text">{value}</span>
        {trend && (
          <span className={cn(
            "text-xs font-semibold px-2 py-0.5 rounded-full",
            trend.isPositive ? "bg-ecms-success/10 text-ecms-success" : "bg-ecms-danger/10 text-ecms-danger"
          )}>
            {trend.value}
          </span>
        )}
      </div>
      {subtitle && <span className="text-xs text-ecms-muted mt-1">{subtitle}</span>}
    </div>
  );
}
