'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconSearch } from '@tabler/icons-react';

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q) router.push(`/reports?q=${encodeURIComponent(q)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="relative hidden md:block">
      <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ecms-muted" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search…"
        className="h-8 w-48 rounded-lg border border-ecms-border bg-ecms-elevated pl-9 pr-3 text-xs text-ecms-text placeholder:text-ecms-muted/60 focus:w-64 focus:border-ecms-amber/60 focus:outline-none transition-all"
      />
    </form>
  );
}
