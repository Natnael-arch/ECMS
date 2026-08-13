import React from 'react';
import { cn } from '@/lib/utils';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-ecms-elevated text-ecms-text',
  success: 'bg-ecms-success/15 text-ecms-success',
  warning: 'bg-ecms-amber/15 text-ecms-amber',
  danger: 'bg-ecms-danger/15 text-ecms-danger',
  info: 'bg-ecms-info/15 text-ecms-info',
};

interface BadgeProps {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}

export function Badge({ tone = 'neutral', className, children }: BadgeProps) {
  return (
    <span className={cn('px-2.5 py-1 text-xs font-semibold rounded-full whitespace-nowrap inline-flex items-center gap-1', tones[tone], className)}>
      {children}
    </span>
  );
}

export function toneForStatus(status: string): BadgeTone {
  const value = status.toLowerCase();
  if (['on track', 'good', 'current', 'done', 'approved', 'issued', 'success', 'complete', 'completed'].includes(value)) return 'success';
  if (['at risk', 'medium', 'pending', 'submitted', 'in-progress', 'in review', 'warning'].includes(value)) return 'warning';
  if (['delayed', 'low', 'superseded', 'rejected', 'over', 'danger', 'failed', 'overdue'].includes(value)) return 'danger';
  if (['info', 'draft', 'new', 'under review', 'ordered'].includes(value)) return 'info';
  return 'neutral';
}
