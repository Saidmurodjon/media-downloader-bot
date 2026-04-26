import { DownloadError, type DownloadResultRemote } from '../types.ts';
import { isSupported } from '../utils/url.ts';
import { downloadYouTube, extractYouTubeId } from './youtube.ts';
import { downloadInstagram, extractInstagramShortcode } from './instagram.ts';

const TIKTOK_RE = /tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com/i;

// TikTok via public API (no key required)
async function downloadTikTok(url: string): Promise<DownloadResultRemote> {
  console.log('[tiktok] →', url.slice(0, 80));

  // Resolve short links first (vm.tiktok.com/xxx → full URL)
  let resolved = url;
  if (/vm\.|vt\./.test(url)) {
    try {
      const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8_000) });
      resolved = r.url;
      console.log('[tiktok] resolved:', resolved.slice(0, 80));
    } catch { /* use original */ }
  }

  // tikwm.com — free, no key needed
  const apiRes = await fetch('https://www.tikwm.com/api/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ url: resolved, count: '1', cursor: '0', hd: '1' }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!apiRes.ok) throw new DownloadError(`TikTok API HTTP ${apiRes.status}`, 'generic');

  interface TikwmResp { code: number; data?: { play?: string; hdplay?: string; title?: string } }
  const data = (await apiRes.json()) as TikwmResp;
  console.log('[tiktok] code:', data.code);

  const videoUrl = data.data?.hdplay || data.data?.play;
  if (!videoUrl) throw new DownloadError('TikTok: no video URL in response', 'generic');

  console.log('[tiktok] ✓', videoUrl.slice(0, 80));
  return { kind: 'remote', url: videoUrl, filename: 'tiktok.mp4', mediaType: 'video' };
}

export async function downloadViaApi(url: string): Promise<DownloadResultRemote> {
  if (!isSupported(url)) throw new DownloadError('Unsupported URL', 'unsupported');

  const errors: string[] = [];

  // ── YouTube ────────────────────────────────────────────────────────
  if (extractYouTubeId(url)) {
    try {
      return await downloadYouTube(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[api] youtube failed:', msg);
      errors.push(`youtube: ${msg}`);
      if (err instanceof DownloadError && err.kind !== 'generic') throw err;
    }
  }

  // ── Instagram ──────────────────────────────────────────────────────
  if (extractInstagramShortcode(url)) {
    try {
      return await downloadInstagram(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[api] instagram failed:', msg);
      errors.push(`instagram: ${msg}`);
      if (err instanceof DownloadError && err.kind !== 'generic') throw err;
    }
  }

  // ── TikTok ─────────────────────────────────────────────────────────
  if (TIKTOK_RE.test(url)) {
    try {
      return await downloadTikTok(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[api] tiktok failed:', msg);
      errors.push(`tiktok: ${msg}`);
    }
  }

  throw new DownloadError(
    `All download methods failed:\n${errors.join('\n')}`,
    'generic',
  );
}
