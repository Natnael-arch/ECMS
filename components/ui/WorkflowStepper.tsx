'use client';

import { cn } from '@/lib/utils';
import { IconCheck } from '@tabler/icons-react';

type Step = { key: string; label: string };

type Props = {
  steps: Step[];
  current: string;
  completedSteps?: string[];
};

export function WorkflowStepper({ steps, current, completedSteps = [] }: Props) {
  const currentIdx = steps.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center gap-1 w-full">
      {steps.map((step, i) => {
        const isCompleted = completedSteps.includes(step.key);
        const isCurrent = step.key === current;
        const isFuture = !isCompleted && !isCurrent;

        return (
          <div key={step.key} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1.5 flex-1">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold border-2 transition-colors shrink-0',
                  isCompleted && 'bg-ecms-success/20 border-ecms-success text-ecms-success',
                  isCurrent && 'bg-ecms-amber/20 border-ecms-amber text-ecms-amber',
                  isFuture && 'bg-ecms-elevated border-ecms-border text-ecms-muted'
                )}
              >
                {isCompleted ? <IconCheck size={16} stroke={2.5} /> : i + 1}
              </div>
              <span
                className={cn(
                  'text-[10px] font-medium text-center leading-tight',
                  isCurrent && 'text-ecms-amber',
                  isCompleted && 'text-ecms-success',
                  isFuture && 'text-ecms-muted'
                )}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  'h-px flex-1 mx-1 -mt-5',
                  isCompleted ? 'bg-ecms-success' : 'bg-ecms-border'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
