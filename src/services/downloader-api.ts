import { DownloadError, type DownloadResultRemote } from '../types.ts';
import { isSupported } from '../utils/url.ts';

// cobalt.tools — free, open-source video download API
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

  let res: Response;
  try {
    res = await fetch(COBALT_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        url,
        videoQuality: '720',
        filenameStyle: 'basic',
        downloadMode: 'auto',
      }),
    });
  } catch {
    throw new DownloadError('Could not reach download API', 'generic');
  }

  if (!res.ok) {
    throw new DownloadError(`Download API error: ${res.status}`, 'generic');
  }

  const data = (await res.json()) as CobaltResponse;

  if (data.status === 'error') {
    const code = data.error?.code ?? '';
    if (code.includes('content.too_long') || code.includes('content.size')) {
      throw new DownloadError('File too large', 'too_large');
    }
    throw new DownloadError(`cobalt error: ${code}`, 'generic');
  }

  // For picker (e.g. Instagram carousel), take the first video item
  if (data.status === 'picker' && data.picker?.length) {
    const item = data.picker.find((p) => p.type === 'video') ?? data.picker[0];
    return { kind: 'remote', url: item.url, filename: data.filename, mediaType: 'video' };
  }

  if (!data.url) {
    throw new DownloadError('No download URL returned', 'generic');
  }

  // Determine media type from filename extension
  const ext = (data.filename ?? data.url).split('.').pop()?.toLowerCase() ?? '';
  const mediaType: DownloadResultRemote['mediaType'] =
    ['mp3', 'ogg', 'm4a', 'aac'].includes(ext)
      ? 'audio'
      : ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
        ? 'photo'
        : 'video';

  return { kind: 'remote', url: data.url, filename: data.filename, mediaType };
}
