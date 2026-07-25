import React from 'react';
import { cn } from '@/lib/utils';

export type StatusType = 'On Track' | 'At Risk' | 'Delayed' | 'Good' | 'Medium' | 'Low' | 'Current' | 'Superseded' | 'alert' | 'success' | 'info';

interface StatusPillProps {
  status: StatusType | string;
  className?: string;
}

export function StatusPill({ status, className }: StatusPillProps) {
  let bgColor = 'bg-ecms-elevated';
  let textColor = 'text-ecms-text';

  switch (status.toLowerCase()) {
    case 'on track':
    case 'good':
    case 'current':
    case 'success':
      bgColor = 'bg-ecms-success/15';
      textColor = 'text-ecms-success';
      break;
    case 'at risk':
    case 'medium':
      bgColor = 'bg-ecms-amber/15';
      textColor = 'text-ecms-amber';
      break;
    case 'delayed':
    case 'low':
    case 'alert':
    case 'superseded':
      bgColor = 'bg-ecms-danger/15';
      textColor = 'text-ecms-danger';
      break;
    case 'info':
      bgColor = 'bg-ecms-info/15';
      textColor = 'text-ecms-info';
      break;
  }

  return (
    <span className={cn("px-2.5 py-1 text-xs font-semibold rounded-full whitespace-nowrap", bgColor, textColor, className)}>
      {status}
    </span>
  );
}
