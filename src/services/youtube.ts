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

// Public Invidious instances — they handle YouTube signature decryption
const INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yt.artemislena.eu',
  'https://invidious.privacyredirect.com',
  'https://invidious.io',
];

interface InvFormat {
  url: string;
  qualityLabel?: string;
  container?: string;
  type?: string;
}

async function tryInvidious(videoId: string): Promise<DownloadResultRemote | null> {
  for (const host of INVIDIOUS) {
    try {
      // local=true → direct YouTube CDN URLs (no Invidious proxy)
      const res = await fetch(
        `${host}/api/v1/videos/${videoId}?fields=formatStreams&local=true`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) {
        console.warn(`[invidious] ${host} → HTTP ${res.status}`);
        continue;
      }

      const data = (await res.json()) as { formatStreams?: InvFormat[] };
      const streams = (data.formatStreams ?? []).filter(
        (f) => f.url && f.container === 'mp4',
      );

      // Prefer 720p, then 480p, then anything
      const pick =
        streams.find((f) => f.qualityLabel === '720p') ??
        streams.find((f) => f.qualityLabel === '480p') ??
        streams.find((f) => f.qualityLabel === '360p') ??
        streams[0];

      if (pick?.url) {
        console.log(`[invidious] ✓ ${host} — ${pick.qualityLabel}`);
        return {
          kind: 'remote',
          url: pick.url,
          filename: `yt_${videoId}.mp4`,
          mediaType: 'video',
        };
      }
    } catch (err) {
      console.warn(`[invidious] ${host} error:`, String(err).slice(0, 80));
    }
  }
  return null;
}

// INNERTUBE direct — works for some videos without cipher
interface IFormat { url?: string; mimeType?: string; height?: number; signatureCipher?: string }
interface IResponse {
  playabilityStatus?: { status: string };
  streamingData?: { formats?: IFormat[]; adaptiveFormats?: IFormat[] };
}

async function tryInnertube(videoId: string): Promise<DownloadResultRemote | null> {
  const clients = [
    {
      ctx: { clientName: 'ANDROID', clientVersion: '19.44.38', androidSdkVersion: 30, hl: 'en', gl: 'US' },
      ua: 'com.google.android.youtube/19.44.38 (Linux; U; Android 11) gzip',
      name: '3',
    },
    {
      ctx: { clientName: 'IOS', clientVersion: '19.45.4', deviceModel: 'iPhone16,2', osVersion: '17.5.1.21F90', hl: 'en', gl: 'US' },
      ua: 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)',
      name: '5',
    },
  ];

  for (const c of clients) {
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': c.ua,
          'X-YouTube-Client-Name': c.name,
          'X-YouTube-Client-Version': c.ctx.clientVersion,
        },
        body: JSON.stringify({ videoId, context: { client: c.ctx } }),
        signal: AbortSignal.timeout(12_000),
      });

      if (!res.ok) continue;
      const data = (await res.json()) as IResponse;
      if (data.playabilityStatus?.status !== 'OK') continue;

      const formats = [
        ...(data.streamingData?.formats ?? []),
        ...(data.streamingData?.adaptiveFormats ?? []),
      ];

      const fmt = formats
        .filter((f) => f.url && f.mimeType?.startsWith('video/mp4') && (f.height ?? 999) <= 720)
        .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];

      if (fmt?.url) {
        console.log(`[innertube] ✓ ${c.ctx.clientName} ${fmt.height}p`);
        return { kind: 'remote', url: fmt.url, filename: `yt_${videoId}.mp4`, mediaType: 'video' };
      }
    } catch { /* try next */ }
  }
  return null;
}

export async function downloadYouTube(url: string): Promise<DownloadResultRemote> {
  const videoId = extractYouTubeId(url);
  if (!videoId) throw new DownloadError('Cannot extract YouTube video ID', 'unsupported');
  console.log('[youtube] videoId:', videoId);

  // 1. Invidious (handles signature decryption — most reliable)
  const inv = await tryInvidious(videoId);
  if (inv) return inv;

  // 2. INNERTUBE direct (works for non-ciphered videos)
  const inn = await tryInnertube(videoId);
  if (inn) return inn;

  throw new DownloadError(
    'YouTube: all Invidious instances failed and no direct stream found',
    'generic',
  );
}
