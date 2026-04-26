import { DownloadError, type DownloadResultRemote } from '../types.ts';
import { isSupported } from '../utils/url.ts';
import { downloadYouTube, extractYouTubeId } from './youtube.ts';
import { downloadInstagram, extractInstagramShortcode } from './instagram.ts';

const COBALT_API = 'https://api.cobalt.tools';

interface CobaltResponse {
  status: 'tunnel' | 'redirect' | 'picker' | 'error';
  url?: string;
  filename?: string;
  picker?: Array<{ type: string; url: string }>;
  error?: { code: string };
}

function guessMediaType(filename = '', url = ''): DownloadResultRemote['mediaType'] {
  const src = (filename || url).toLowerCase().split('?')[0];
  const ext = src.split('.').pop() ?? '';
  if (['mp3', 'ogg', 'm4a', 'aac', 'wav', 'flac'].includes(ext)) return 'audio';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'photo';
  return 'video';
}

async function tryCobalt(url: string): Promise<DownloadResultRemote> {
  console.log('[cobalt] →', url.slice(0, 80));

  let res: Response;
  try {
    res = await fetch(COBALT_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; MediaBot/2.0)',
      },
      body: JSON.stringify({ url, videoQuality: '720', filenameStyle: 'basic' }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new DownloadError(`cobalt network: ${String(err).slice(0, 80)}`, 'generic');
  }

  const body = await res.text();
  console.log('[cobalt] http', res.status, body.slice(0, 200));

  if (!res.ok) throw new DownloadError(`cobalt HTTP ${res.status}: ${body.slice(0, 80)}`, 'generic');

  let data: CobaltResponse;
  try { data = JSON.parse(body) as CobaltResponse; }
  catch { throw new DownloadError(`cobalt bad JSON: ${body.slice(0, 80)}`, 'generic'); }

  if (data.status === 'error') {
    const code = data.error?.code ?? 'unknown';
    if (code.includes('content.too_long') || code.includes('content.size')) {
      throw new DownloadError('File too large', 'too_large');
    }
    throw new DownloadError(`cobalt: ${code}`, 'generic');
  }

  if (data.status === 'picker') {
    const item = data.picker?.find((p) => p.type === 'video') ?? data.picker?.[0];
    if (!item?.url) throw new DownloadError('picker empty', 'generic');
    return { kind: 'remote', url: item.url, filename: data.filename, mediaType: 'video' };
  }

  if (!data.url) throw new DownloadError(`cobalt no url, status=${data.status}`, 'generic');

  const mediaType = guessMediaType(data.filename, data.url);
  console.log('[cobalt] ✓', data.status, mediaType);
  return { kind: 'remote', url: data.url, filename: data.filename, mediaType };
}

export async function downloadViaApi(url: string): Promise<DownloadResultRemote> {
  if (!isSupported(url)) throw new DownloadError('Unsupported URL', 'unsupported');

  const errors: string[] = [];

  // ── 1. cobalt.tools (handles YouTube, Instagram, TikTok, Twitter) ──
  try {
    return await tryCobalt(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[api] cobalt failed:', msg);
    errors.push(`cobalt: ${msg}`);

    // Re-throw non-generic errors (too_large, unsupported)
    if (err instanceof DownloadError && err.kind !== 'generic') throw err;
  }

  // ── 2. YouTube INNERTUBE fallback ──────────────────────────────────
  if (extractYouTubeId(url)) {
    try {
      return await downloadYouTube(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[api] youtube fallback failed:', msg);
      errors.push(`youtube: ${msg}`);
    }
  }

  // ── 3. Instagram embed fallback ────────────────────────────────────
  if (extractInstagramShortcode(url)) {
    try {
      return await downloadInstagram(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[api] instagram fallback failed:', msg);
      errors.push(`instagram: ${msg}`);
    }
  }

  // All methods exhausted
  throw new DownloadError(`All download methods failed:\n${errors.join('\n')}`, 'generic');
}
