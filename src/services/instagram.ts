import { DownloadError, type DownloadResultRemote } from '../types.ts';

export function extractInstagramShortcode(url: string): string | null {
  const m = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([\w-]+)/);
  return m?.[1] ?? null;
}

// Try to get Instagram video URL from the embed page (works for public posts)
export async function downloadInstagram(url: string): Promise<DownloadResultRemote> {
  const shortcode = extractInstagramShortcode(url);
  if (!shortcode) throw new DownloadError('Cannot extract Instagram shortcode', 'unsupported');

  console.log('[instagram] shortcode:', shortcode);

  // Instagram embed page often contains the direct video URL in OG meta
  const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/`;
  const res = await fetch(embedUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new DownloadError(`Instagram embed HTTP ${res.status}`, 'generic');

  const html = await res.text();

  // Extract video URL from various patterns
  const videoMatch =
    html.match(/video_url":"([^"]+)"/) ??
    html.match(/"contentUrl"\s*:\s*"([^"]+)"/) ??
    html.match(/<meta property="og:video" content="([^"]+)"/) ??
    html.match(/src="(https:\/\/[^"]*\.mp4[^"]*)"/) ??
    html.match(/src="(https:\/\/scontent[^"]+\.mp4[^"]*)"/);

  if (!videoMatch?.[1]) {
    throw new DownloadError('No video URL found in Instagram embed', 'generic');
  }

  // Unescape unicode in URL
  const videoUrl = videoMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
  console.log('[instagram] ✓', videoUrl.slice(0, 80));
  return { kind: 'remote', url: videoUrl, filename: `instagram_${shortcode}.mp4`, mediaType: 'video' };
}
