import React from 'react';
import { ganttActivities } from '@/lib/data';
import { cn } from '@/lib/utils';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function GanttChart() {
  const getMonthIndex = (monthStr: string | null) => {
    if (!monthStr) return -1;
    return months.indexOf(monthStr);
  };

  return (
    <div className="bg-ecms-card border border-ecms-border rounded-xl p-5 overflow-x-auto w-full">
      <div className="min-w-[800px]">
        {/* Header (Months) */}
        <div className="flex border-b border-ecms-border pb-2">
          <div className="w-[200px] shrink-0 font-medium text-sm text-ecms-muted">Activity</div>
          <div className="flex-1 flex">
            {months.map(m => (
              <div key={m} className="flex-1 text-center text-xs font-medium text-ecms-muted border-l border-ecms-border/50 first:border-l-0">
                {m}
              </div>
            ))}
          </div>
        </div>

        {/* Rows */}
        <div className="flex flex-col mt-2 gap-2">
          {ganttActivities.map((act) => {
            const startIdx = getMonthIndex(act.start);
            const endIdx = getMonthIndex(act.end);
            const actualStartIdx = getMonthIndex(act.actualStart);
            const actualEndIdx = getMonthIndex(act.actualEnd);
            
            const totalMonths = 12;

            const plannedLeft = (startIdx / totalMonths) * 100;
            const plannedWidth = ((endIdx - startIdx + 1) / totalMonths) * 100;

            const actualLeft = actualStartIdx >= 0 ? (actualStartIdx / totalMonths) * 100 : 0;
            const actualWidth = (actualStartIdx >= 0 && actualEndIdx >= 0) ? ((actualEndIdx - actualStartIdx + 1) / totalMonths) * 100 : 0;

            return (
              <div key={act.id} className="flex items-center group">
                <div className="w-[200px] shrink-0 text-sm font-medium text-ecms-text truncate pr-4">
                  {act.name}
                  <div className="text-xs text-ecms-muted">{act.progress}% complete</div>
                </div>
                <div className="flex-1 relative h-10 border-l border-ecms-border/50">
                  {/* Grid lines */}
                  <div className="absolute inset-0 flex pointer-events-none">
                    {months.map(m => (
                      <div key={m} className="flex-1 border-r border-ecms-border/20 last:border-r-0" />
                    ))}
                  </div>

                  {/* Planned Bar (Baseline) */}
                  <div 
                    className="absolute h-2.5 top-1.5 bg-ecms-elevated border border-ecms-border rounded-sm z-10"
                    style={{ left: `${plannedLeft}%`, width: `${plannedWidth}%` }}
                    title={`Planned: ${act.start} - ${act.end}`}
                  />
                  
                  {/* Actual Bar */}
                  {actualStartIdx >= 0 && (
                    <div 
                      className="absolute h-2.5 bottom-1.5 bg-ecms-amber rounded-sm z-20 shadow-[0_0_8px_rgba(245,166,35,0.4)]"
                      style={{ left: `${actualLeft}%`, width: `${actualWidth}%` }}
                      title={`Actual: ${act.actualStart} - ${act.actualEnd}`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Legend */}
        <div className="flex items-center gap-6 mt-6 pt-4 border-t border-ecms-border justify-end">
          <div className="flex items-center gap-2">
            <div className="w-4 h-2.5 bg-ecms-elevated border border-ecms-border rounded-sm" />
            <span className="text-xs text-ecms-muted">Baseline</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-2.5 bg-ecms-amber rounded-sm shadow-[0_0_8px_rgba(245,166,35,0.4)]" />
            <span className="text-xs text-ecms-muted">Actual Progress</span>
          </div>
        </div>
      </div>
    </div>
  );
}
