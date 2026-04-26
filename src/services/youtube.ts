import { DownloadError, type DownloadResultRemote } from '../types.ts';

export function extractYouTubeId(url: string): string | null {
  const m =
    url.match(/[?&]v=([\w-]{11})/) ??
    url.match(/youtu\.be\/([\w-]{11})/) ??
    url.match(/\/shorts\/([\w-]{11})/) ??
    url.match(/\/embed\/([\w-]{11})/) ??
    url.match(/\/live\/([\w-]{11})/);
  return m?.[1] ?? null;
}

interface IFormat {
  itag?: number;
  url?: string;
  mimeType?: string;
  height?: number;
  bitrate?: number;
  signatureCipher?: string;
}
interface IResponse {
  playabilityStatus?: { status: string; reason?: string };
  streamingData?: { formats?: IFormat[]; adaptiveFormats?: IFormat[] };
}

const CLIENTS = [
  // Android — most reliable for direct non-ciphered URLs
  {
    name: 'ANDROID',
    context: {
      clientName: 'ANDROID',
      clientVersion: '19.44.38',
      androidSdkVersion: 30,
      hl: 'en',
      gl: 'US',
    },
    headers: {
      'User-Agent': 'com.google.android.youtube/19.44.38 (Linux; U; Android 11) gzip',
      'X-YouTube-Client-Name': '3',
      'X-YouTube-Client-Version': '19.44.38',
    },
  },
  // iOS — good fallback
  {
    name: 'IOS',
    context: {
      clientName: 'IOS',
      clientVersion: '19.45.4',
      deviceModel: 'iPhone16,2',
      osVersion: '17.5.1.21F90',
      hl: 'en',
      gl: 'US',
    },
    headers: {
      'User-Agent':
        'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)',
      'X-YouTube-Client-Name': '5',
      'X-YouTube-Client-Version': '19.45.4',
    },
  },
  // TV Embedded — no cipher for many videos
  {
    name: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
    context: {
      clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
      clientVersion: '2.0',
      hl: 'en',
      gl: 'US',
    },
    headers: {
      'User-Agent':
        'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1',
      'X-YouTube-Client-Name': '85',
      'X-YouTube-Client-Version': '2.0',
    },
  },
];

async function fetchFormats(videoId: string, client: (typeof CLIENTS)[0]): Promise<IFormat[]> {
  // No API key in URL — Android/iOS clients don't need it
  const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...client.headers },
    body: JSON.stringify({
      videoId,
      context: { client: client.context },
      playbackContext: {
        contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' },
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  console.log(`[youtube:${client.name}] status=${res.status}`);
  if (!res.ok) return [];

  const data = (await res.json()) as IResponse;
  const ps = data.playabilityStatus?.status;
  console.log(`[youtube:${client.name}] playability=${ps}`);
  if (ps !== 'OK') return [];

  return [
    ...(data.streamingData?.formats ?? []),
    ...(data.streamingData?.adaptiveFormats ?? []),
  ];
}

function bestFormat(formats: IFormat[]): IFormat | null {
  return (
    formats
      .filter((f) => f.url && f.mimeType?.startsWith('video/mp4') && (f.height ?? 9999) <= 720)
      .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0] ?? null
  );
}

export async function downloadYouTube(url: string): Promise<DownloadResultRemote> {
  const videoId = extractYouTubeId(url);
  if (!videoId) throw new DownloadError('Cannot extract YouTube video ID', 'unsupported');
  console.log('[youtube] videoId:', videoId);

  for (const client of CLIENTS) {
    try {
      const formats = await fetchFormats(videoId, client);
      const fmt = bestFormat(formats);
      if (fmt?.url) {
        console.log(`[youtube] ✓ ${client.name} ${fmt.height}p itag=${fmt.itag}`);
        return {
          kind: 'remote',
          url: fmt.url,
          filename: `yt_${videoId}.mp4`,
          mediaType: 'video',
        };
      }
      console.warn(`[youtube:${client.name}] no usable format`);
    } catch (err) {
      console.warn(`[youtube:${client.name}] error:`, String(err).slice(0, 100));
    }
  }

  throw new DownloadError('YouTube: no direct stream URL found for any client', 'generic');
}
