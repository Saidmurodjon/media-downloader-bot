import { DownloadError, type DownloadResultRemote } from '../types.ts';

// YouTube ANDROID_EMBEDDED client — often returns usable URLs without sig decryption
const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/player';
const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

interface InnertubeFormat {
  itag: number;
  url?: string;
  mimeType?: string;
  bitrate?: number;
  width?: number;
  height?: number;
  quality?: string;
}

interface InnertubeResponse {
  playabilityStatus?: { status: string; reason?: string };
  streamingData?: {
    formats?: InnertubeFormat[];
    adaptiveFormats?: InnertubeFormat[];
  };
  videoDetails?: { title?: string };
}

export function extractYouTubeId(url: string): string | null {
  const m =
    url.match(/[?&]v=([\w-]{11})/) ??
    url.match(/youtu\.be\/([\w-]{11})/) ??
    url.match(/\/shorts\/([\w-]{11})/) ??
    url.match(/\/embed\/([\w-]{11})/) ??
    url.match(/\/live\/([\w-]{11})/);
  return m?.[1] ?? null;
}

export async function downloadYouTube(url: string): Promise<DownloadResultRemote> {
  const videoId = extractYouTubeId(url);
  if (!videoId) throw new DownloadError('Cannot extract YouTube video ID', 'unsupported');

  console.log('[youtube] videoId:', videoId);

  const res = await fetch(`${INNERTUBE_URL}?key=${INNERTUBE_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'com.google.android.youtube/17.31.35 (Linux; U; Android 11) gzip',
      'X-YouTube-Client-Name': '55',
      'X-YouTube-Client-Version': '17.31.35',
    },
    body: JSON.stringify({
      videoId,
      context: {
        client: {
          clientName: 'ANDROID_EMBEDDED_PLAYER',
          clientVersion: '17.31.35',
          androidSdkVersion: 30,
          hl: 'en',
          gl: 'US',
        },
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new DownloadError(`YouTube API HTTP ${res.status}`, 'generic');

  const data = (await res.json()) as InnertubeResponse;
  console.log('[youtube] playability:', data.playabilityStatus?.status);

  if (data.playabilityStatus?.status !== 'OK') {
    const reason = data.playabilityStatus?.reason ?? data.playabilityStatus?.status ?? 'unknown';
    throw new DownloadError(`YouTube not playable: ${reason}`, 'generic');
  }

  const formats: InnertubeFormat[] = [
    ...(data.streamingData?.formats ?? []),
    ...(data.streamingData?.adaptiveFormats ?? []),
  ];

  // Find best mp4 video ≤ 720p with a direct URL
  const video = formats
    .filter((f) => f.url && f.mimeType?.startsWith('video/mp4') && (f.height ?? 9999) <= 720)
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];

  if (!video?.url) {
    throw new DownloadError('No direct YouTube stream URL (may need sig decryption)', 'generic');
  }

  console.log('[youtube] ✓ format', video.itag, `${video.height}p`, video.url.slice(0, 80));
  return { kind: 'remote', url: video.url, filename: `video_${videoId}.mp4`, mediaType: 'video' };
}
