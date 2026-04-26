import { DownloadError, type DownloadResultRemote } from '../types.ts';
import { isSupported } from '../utils/url.ts';

const COBALT_API = 'https://api.cobalt.tools';

interface CobaltResponse {
  status: 'tunnel' | 'redirect' | 'picker' | 'error';
  url?: string;
  filename?: string;
  audio?: string;
  picker?: Array<{ type: string; url: string; thumb?: string }>;
  error?: { code: string };
}

export async function downloadViaApi(url: string): Promise<DownloadResultRemote> {
  if (!isSupported(url)) {
    throw new DownloadError('Unsupported URL', 'unsupported');
  }

  console.log('[downloader-api] requesting:', url);

  let res: Response;
  try {
    res = await fetch(COBALT_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      body: JSON.stringify({
        url,
        videoQuality: '720',
        filenameStyle: 'basic',
        downloadMode: 'auto',
      }),
    });
  } catch (err) {
    console.error('[downloader-api] fetch error:', err);
    throw new DownloadError('Could not reach cobalt API', 'generic');
  }

  const rawText = await res.text();
  console.log('[downloader-api] status:', res.status, 'body:', rawText.slice(0, 300));

  if (!res.ok) {
    throw new DownloadError(`cobalt API HTTP ${res.status}: ${rawText}`, 'generic');
  }

  let data: CobaltResponse;
  try {
    data = JSON.parse(rawText) as CobaltResponse;
  } catch {
    throw new DownloadError(`cobalt bad JSON: ${rawText.slice(0, 100)}`, 'generic');
  }

  if (data.status === 'error') {
    const code = data.error?.code ?? 'unknown';
    console.error('[downloader-api] cobalt error:', code);
    if (code.includes('content.too_long') || code.includes('content.size')) {
      throw new DownloadError('File too large', 'too_large');
    }
    throw new DownloadError(`cobalt: ${code}`, 'generic');
  }

  // Instagram carousel / multi-picker
  if (data.status === 'picker' && data.picker?.length) {
    const item = data.picker.find((p) => p.type === 'video') ?? data.picker[0];
    console.log('[downloader-api] picker item:', item.url.slice(0, 80));
    return { kind: 'remote', url: item.url, filename: data.filename, mediaType: 'video' };
  }

  if (!data.url) {
    throw new DownloadError(`cobalt returned no url. status=${data.status}`, 'generic');
  }

  const ext = (data.filename ?? '').split('.').pop()?.toLowerCase() ?? '';
  const mediaType: DownloadResultRemote['mediaType'] =
    ['mp3', 'ogg', 'm4a', 'aac'].includes(ext) ? 'audio'
    : ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? 'photo'
    : 'video';

  console.log('[downloader-api] success:', data.status, data.url.slice(0, 80));
  return { kind: 'remote', url: data.url, filename: data.filename, mediaType };
}
