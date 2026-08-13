'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/lib/http';

interface UseApiOptions {
  deps?: unknown[];
  enabled?: boolean;
}

export function useApi<T>(url: string | null, { deps = [], enabled = true }: UseApiOptions = {}) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState<string | null>(null);

  const depsKey = deps.join('|');

  useEffect(() => {
    if (!url || !enabled) return;
    let cancelled = false;
    apiGet<T>(url)
      .then((result) => { if (!cancelled) setData(result); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load data.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [url, enabled, depsKey]);

  const reload = useCallback(() => {
    if (!url || !enabled) return;
    setLoading(true);
    setError(null);
    apiGet<T>(url)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load data.'))
      .finally(() => setLoading(false));
  }, [url, enabled]);

  return { data, loading, error, reload };
}
