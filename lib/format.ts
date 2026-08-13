export function money(value: number | string | bigint | null | undefined, currency = 'ETB'): string {
  if (value == null) return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-ET', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
}

export function num(value: number | string | bigint | null | undefined, digits = 2): string {
  if (value == null) return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-ET', { maximumFractionDigits: digits }).format(n);
}

export function date(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' });
}

export function dateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return `${date(d)} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

export function pct(value: number | string | bigint | null | undefined): string {
  if (value == null) return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(1)}%`;
}

export function moneySum(values: Array<number | string | bigint | null | undefined>): number {
  return values.reduce((sum, v) => sum + (typeof v === 'number' ? v : Number(v ?? 0)), 0);
}
