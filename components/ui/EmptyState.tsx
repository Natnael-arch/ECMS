import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 px-6 text-center">
      {icon && <div className="text-ecms-muted/60">{icon}</div>}
      <div>
        <p className="text-sm font-semibold text-ecms-text">{title}</p>
        {message && <p className="text-xs text-ecms-muted mt-1 max-w-sm">{message}</p>}
      </div>
      {action}
    </div>
  );
}
