import React from 'react';
import { cn } from '@/lib/utils';

interface ProgressBarProps {
  progress: number;
  colorClass?: string;
  className?: string;
  showLabel?: boolean;
}

export function ProgressBar({ progress, colorClass = "bg-ecms-amber", className, showLabel = true }: ProgressBarProps) {
  const safeProgress = Math.max(0, Math.min(100, progress));
  
  return (
    <div className={cn("flex flex-col gap-1.5 w-full", className)}>
      <div className="flex justify-between items-center text-xs">
        {showLabel && <span className="text-ecms-muted">Progress</span>}
        {showLabel && <span className="font-medium text-ecms-text">{safeProgress}%</span>}
      </div>
      <div className="h-2 w-full bg-ecms-elevated rounded-full overflow-hidden">
        <div 
          className={cn("h-full rounded-full transition-all duration-500 ease-out", colorClass)} 
          style={{ width: `${safeProgress}%` }}
        />
      </div>
    </div>
  );
}
