import React from 'react';
import { Badge, toneForStatus } from '@/components/ui/Badge';

interface StatusPillProps {
  status: string;
  className?: string;
}

export function StatusPill({ status, className }: StatusPillProps) {
  return <Badge tone={toneForStatus(status)} className={className}>{status}</Badge>;
}
