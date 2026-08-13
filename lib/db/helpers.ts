import { db } from '@/lib/db';

export function clean(value: unknown, max = 250) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function resolveProject(code: string) {
  return db.projects.findFirst({
    where: { project_code: { equals: code, mode: 'insensitive' } },
  });
}

export async function firstProject() {
  return db.projects.findFirst({ orderBy: { created_at: 'asc' } });
}

/** Formats an integer-millimetre chainage value as 6+930.000 */
export function formatChainage(mm: number | bigint | null | undefined): string {
  if (mm == null) return '—';
  const value = Number(mm);
  const km = Math.floor(value / 1_000_000);
  const rest = value % 1_000_000;
  const meters = Math.floor(rest / 1000);
  const millis = rest % 1000;
  return `${km}+${String(meters).padStart(3, '0')}.${String(millis).padStart(3, '0')}`;
}

export function parseChainage(display: string): number | null {
  const match = /^\s*(\d+)\s*\+\s*(\d{1,3})(?:\.(\d{1,3}))?\s*$/.exec(display);
  if (!match) return null;
  const km = Number(match[1]);
  const meters = Number(match[2]);
  const millis = Number((match[3] ?? '0').padEnd(3, '0'));
  return km * 1_000_000 + meters * 1000 + millis;
}
