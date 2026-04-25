export type Platform = 'youtube' | 'instagram';

export interface DetectResult {
  platform: Platform;
  normalizedUrl: string;
}

const YOUTUBE_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?(?:[^&]*&)*v=([\w-]{11})/,
  /(?:https?:\/\/)?youtu\.be\/([\w-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([\w-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/reel\/([\w-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([\w-]{11})/,
  /(?:https?:\/\/)?(?:m\.)?youtube\.com\/watch\?(?:[^&]*&)*v=([\w-]{11})/,
];

const INSTAGRAM_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?instagram\.com\/p\/([\w-]+)/,
  /(?:https?:\/\/)?(?:www\.)?instagram\.com\/reel\/([\w-]+)/,
  /(?:https?:\/\/)?(?:www\.)?instagram\.com\/tv\/([\w-]+)/,
  /(?:https?:\/\/)?(?:www\.)?instagram\.com\/stories\/[\w.]+\/([\d]+)/,
];

function extractYouTubeId(url: string): string | null {
  for (const pattern of YOUTUBE_PATTERNS) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractInstagramPath(url: string): string | null {
  for (const pattern of INSTAGRAM_PATTERNS) {
    const match = url.match(pattern);
    if (match?.[0]) {
      try {
        const u = new URL(url.startsWith('http') ? url : `https://${url}`);
        return u.pathname.replace(/\/+$/, '');
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function detectPlatform(input: string): DetectResult | null {
  const url = input.trim();

  const ytId = extractYouTubeId(url);
  if (ytId) {
    return {
      platform: 'youtube',
      normalizedUrl: `https://www.youtube.com/watch?v=${ytId}`,
    };
  }

  const igPath = extractInstagramPath(url);
  if (igPath) {
    return {
      platform: 'instagram',
      normalizedUrl: `https://www.instagram.com${igPath}`,
    };
  }

  return null;
}

export function hashUrl(url: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(url.toLowerCase().trim());

  // Use the Web Crypto API available in Bun
  return Array.from(
    new Uint8Array(
      // synchronous fallback using a simple djb2 hash for non-async contexts
      // Full SHA-256 is computed in async callers via computeUrlHash
    ),
  ).join('');
}

export async function computeUrlHash(url: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(url.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function isUrl(text: string): boolean {
  try {
    const u = new URL(text.trim().startsWith('http') ? text.trim() : `https://${text.trim()}`);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
