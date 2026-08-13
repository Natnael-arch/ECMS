import React from 'react';

interface SectionHeaderProps {
  title: string;
  actions?: React.ReactNode;
}

export function SectionHeader({ title, actions }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-ecms-border pb-3">
      <h2 className="text-lg font-semibold text-ecms-text">{title}</h2>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
