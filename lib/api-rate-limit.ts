import { NextRequest } from 'next/server';

interface WindowEntry {
  count: number;
  resetAt: number;
}

const windows = new Map<string, WindowEntry>();

/**
 * Best-effort per-process ingress rate limiter.
 * IMPORTANT: Forwarded IP headers ('x-forwarded-for', 'x-real-ip') are trusted ONLY
 * behind a reverse proxy (e.g. Cloudflare, Nginx) that explicitly overwrites them.
 * On unprotected direct endpoints, clients can spoof these headers.
 * Process-local state supports single-instance deployments; multi-instance deployments
 * require an edge or centralized shared store (e.g., Redis).
 */
export function allowApiRequest(request: NextRequest, scope: string, limit: number, windowMs = 60_000): boolean {
  const address = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  const key = `${scope}:${address}`;
  const current = windows.get(key);

  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    if (current.count >= limit) return false;
    current.count++;
  }

  if (windows.size > 2048) {
    for (const [entryKey, entry] of windows) {
      if (entry.resetAt <= now) windows.delete(entryKey);
    }
    while (windows.size > 2048) {
      const oldestKey = windows.keys().next().value;
      if (!oldestKey) break;
      windows.delete(oldestKey);
    }
  }
  return true;
}
