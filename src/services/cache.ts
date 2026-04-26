import type { DbAdapter } from '../types.ts';

export async function hashUrl(url: string): Promise<string> {
  // Normalize URL before hashing: lowercase scheme+host, strip tracking params
  let normalized = url.trim().toLowerCase();
  try {
    const parsed = new URL(url.trim());
    // Keep only path-relevant search params for YouTube
    const keepParams = ['v', 'id'];
    const filtered = new URLSearchParams();
    for (const key of keepParams) {
      if (parsed.searchParams.has(key)) filtered.set(key, parsed.searchParams.get(key)!);
    }
    const qs = filtered.toString();
    normalized = `${parsed.hostname}${parsed.pathname}${qs ? '?' + qs : ''}`;
  } catch {
    // fallback to raw url
  }

  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function getCached(db: DbAdapter, url: string) {
  const hash = await hashUrl(url);
  return db.getCachedMedia(hash);
}

export async function setCache(
  db: DbAdapter,
  url: string,
  fileId: string,
  mediaType: 'video' | 'photo' | 'audio',
): Promise<void> {
  const hash = await hashUrl(url);
  await db.setCachedMedia(hash, fileId, mediaType);
}
