import { DownloadError, type DownloadResultRemote } from '../types.ts';

export function extractInstagramShortcode(url: string): string | null {
  const m = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([\w-]+)/);
  return m?.[1] ?? null;
}

function unescapeUrl(raw: string): string {
  return raw.replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/\\/g, '');
}

export async function downloadInstagram(url: string): Promise<DownloadResultRemote> {
  const shortcode = extractInstagramShortcode(url);
  if (!shortcode) throw new DownloadError('Cannot extract Instagram shortcode', 'unsupported');
  console.log('[instagram] shortcode:', shortcode);

  const commonHeaders = {
    'User-Agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  // ── Attempt 1: embed page ──────────────────────────────────────────
  try {
    const res = await fetch(`https://www.instagram.com/p/${shortcode}/embed/captioned/`, {
      headers: commonHeaders,
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const html = await res.text();
      const patterns = [
        /video_url":"(https:\\\/\\\/[^"]+\.mp4[^"]*)/,
        /"contentUrl"\s*:\s*"(https:[^"]+\.mp4[^"]*)"/,
        /src="(https:\/\/[^"]*scontent[^"]*\.mp4[^"]*)"/,
        /property="og:video" content="([^"]+)"/,
        /video_url\\?":\s*\\?"([^"\\]+)/,
      ];
      for (const re of patterns) {
        const m = html.match(re);
        if (m?.[1]) {
          const videoUrl = unescapeUrl(m[1]);
          console.log('[instagram] ✓ embed match:', re.source.slice(0, 40));
          return { kind: 'remote', url: videoUrl, filename: `ig_${shortcode}.mp4`, mediaType: 'video' };
        }
      }
    }
  } catch (err) {
    console.warn('[instagram] embed failed:', String(err).slice(0, 80));
  }

  // ── Attempt 2: OG video tag from main page ─────────────────────────
  try {
    const res = await fetch(`https://www.instagram.com/p/${shortcode}/`, {
      headers: commonHeaders,
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const html = await res.text();
      const m =
        html.match(/property="og:video" content="([^"]+)"/) ??
        html.match(/"video_url":"([^"]+)"/);
      if (m?.[1]) {
        const videoUrl = unescapeUrl(m[1]);
        console.log('[instagram] ✓ og:video');
        return { kind: 'remote', url: videoUrl, filename: `ig_${shortcode}.mp4`, mediaType: 'video' };
      }
    }
  } catch (err) {
    console.warn('[instagram] main page failed:', String(err).slice(0, 80));
  }

  throw new DownloadError('Instagram: could not extract video URL', 'generic');
}
