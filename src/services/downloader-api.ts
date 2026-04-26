import { DownloadError, type DownloadResultRemote } from '../types.ts';
import { isSupported } from '../utils/url.ts';

const COBALT_API = 'https://api.cobalt.tools';
const TIMEOUT_MS = 20_000;

interface CobaltResponse {
  status: 'tunnel' | 'redirect' | 'picker' | 'error';
  url?: string;
  filename?: string;
  picker?: Array<{ type: string; url: string }>;
  error?: { code: string };
}

function guessMediaType(filename = '', url = ''): DownloadResultRemote['mediaType'] {
  const src = (filename || url).toLowerCase();
  const ext = src.split('?')[0].split('.').pop() ?? '';
  if (['mp3', 'ogg', 'm4a', 'aac', 'wav', 'flac'].includes(ext)) return 'audio';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'photo';
  return 'video';
}

export async function downloadViaApi(url: string): Promise<DownloadResultRemote> {
  if (!isSupported(url)) {
    throw new DownloadError('Unsupported URL', 'unsupported');
  }

  console.log('[cobalt] →', url);

  let res: Response;
  try {
    res = await fetch(COBALT_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; MediaBot/2.0)',
      },
      body: JSON.stringify({ url, videoQuality: '720', filenameStyle: 'basic' }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error('[cobalt] network error:', err);
    throw new DownloadError('Download service unreachable', 'generic');
  }

  const body = await res.text();
  console.log('[cobalt] http', res.status, body.slice(0, 200));

  if (!res.ok) {
    throw new DownloadError(`cobalt HTTP ${res.status}`, 'generic');
  }

  let data: CobaltResponse;
  try {
    data = JSON.parse(body) as CobaltResponse;
  } catch {
    throw new DownloadError('cobalt returned invalid JSON', 'generic');
  }

  if (data.status === 'error') {
    const code = data.error?.code ?? 'unknown';
    console.error('[cobalt] error code:', code);
    if (code.includes('content.too_long') || code.includes('content.size')) {
      throw new DownloadError('File too large', 'too_large');
    }
    throw new DownloadError(`cobalt: ${code}`, 'generic');
  }

  // Instagram carousel / multi-item picker
  if (data.status === 'picker') {
    const video = data.picker?.find((p) => p.type === 'video') ?? data.picker?.[0];
    if (!video?.url) throw new DownloadError('picker had no URL', 'generic');
    console.log('[cobalt] picker url:', video.url.slice(0, 80));
    return { kind: 'remote', url: video.url, filename: data.filename, mediaType: 'video' };
  }

  if (!data.url) {
    throw new DownloadError(`cobalt no url (status=${data.status})`, 'generic');
  }

  const mediaType = guessMediaType(data.filename, data.url);
  console.log('[cobalt] ✓', data.status, mediaType, data.url.slice(0, 80));
  return { kind: 'remote', url: data.url, filename: data.filename, mediaType };
}
