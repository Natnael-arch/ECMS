import React from 'react';
import { cn } from '@/lib/utils';
import { IconAlertTriangle, IconInfoCircle, IconCheck, IconX } from '@tabler/icons-react';

interface AlertStripProps {
  message: string;
  type?: 'warning' | 'error' | 'info' | 'success';
  className?: string;
}

export function AlertStrip({ message, type = 'warning', className }: AlertStripProps) {
  let icon = <IconAlertTriangle size={18} />;
  let colors = 'bg-ecms-amber-dim text-ecms-amber border-ecms-amber/20';
  
  if (type === 'error') {
    colors = 'bg-ecms-danger/10 text-ecms-danger border-ecms-danger/20';
    icon = <IconX size={18} />;
  } else if (type === 'info') {
    colors = 'bg-ecms-info/10 text-ecms-info border-ecms-info/20';
    icon = <IconInfoCircle size={18} />;
  } else if (type === 'success') {
    colors = 'bg-ecms-success/10 text-ecms-success border-ecms-success/20';
    icon = <IconCheck size={18} />;
  }

  return (
    <div className={cn("px-4 py-3 border rounded-lg flex items-center gap-3 font-medium text-sm", colors, className)}>
      {icon}
      <span>{message}</span>
    </div>
  );
}
