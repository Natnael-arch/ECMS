export async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${response.status})`);
  }
  return data as T;
}

export function apiGet<T>(url: string): Promise<T> {
  return apiRequest<T>(url);
}

export function apiPost<T>(url: string, body: unknown): Promise<T> {
  return apiRequest<T>(url, { method: 'POST', body: JSON.stringify(body) });
}
