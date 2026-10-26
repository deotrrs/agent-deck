export async function api<T = unknown>(url: string, init?: RequestInit & { body?: BodyInit | null }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...(init?.headers || {}) } : init?.headers,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

export const q = (repo: string) => `repo=${encodeURIComponent(repo)}`;

export function timeAgo(ts: number) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function duration(ms?: number) {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export function money(v?: number) {
  if (v == null) return "—";
  return `$${v.toFixed(v < 1 ? 3 : 2)}`;
}
