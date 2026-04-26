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

type MaybeUrl = string | null;

// ── 1. Piped API (open-source YouTube frontend, handles sig decryption) ──
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://piped-api.garudalinux.org',
  'https://pipedapi.adminforge.de',
  'https://api.piped.projectsegfau.lt',
  'https://piped-api.cfe.re',
];

async function tryPiped(videoId: string): Promise<MaybeUrl> {
  for (const host of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${host}/streams/${videoId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) { console.warn(`[piped] ${host} → ${res.status}`); continue; }

      interface PStream { url: string; quality: string; format: string; videoOnly?: boolean }
      interface PResp { videoStreams?: PStream[]; audioStreams?: PStream[]; error?: string }
      const data = (await res.json()) as PResp;
      if (data.error) { console.warn(`[piped] ${host} error:`, data.error); continue; }

      // Prefer muxed MP4 (video+audio combined), then any MP4
      const streams = data.videoStreams ?? [];
      const pick =
        streams.find((s) => s.format === 'MP4' && !s.videoOnly && /720|480|360/.test(s.quality)) ??
        streams.find((s) => s.format === 'MP4' && !s.videoOnly) ??
        streams.find((s) => s.format === 'MP4');

      if (pick?.url) {
        console.log(`[piped] ✓ ${host} ${pick.quality}`);
        return pick.url;
      }
    } catch (err) {
      console.warn(`[piped] ${host}:`, String(err).slice(0, 60));
    }
  }
  return null;
}

// ── 2. Invidious (without local=true — uses their own proxy URLs) ──────────
const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://iv.datura.network',
  'https://invidious.nerdvpn.de',
  'https://invidious.baczek.me',
  'https://yt.cdaut.de',
  'https://invidious.privacyredirect.com',
  'https://yt.artemislena.eu',
];

async function tryInvidious(videoId: string): Promise<MaybeUrl> {
  for (const host of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(
        `${host}/api/v1/videos/${videoId}?fields=formatStreams`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) { console.warn(`[inv] ${host} → ${res.status}`); continue; }

      interface IStream { url: string; qualityLabel: string; container: string }
      const data = (await res.json()) as { formatStreams?: IStream[] };
      const streams = (data.formatStreams ?? []).filter(
        (f) => f.url && f.container === 'mp4',
      );
      const pick =
        streams.find((f) => f.qualityLabel === '720p') ??
        streams.find((f) => f.qualityLabel === '480p') ??
        streams.find((f) => f.qualityLabel === '360p') ??
        streams[0];

      if (pick?.url) {
        console.log(`[inv] ✓ ${host} ${pick.qualityLabel}`);
        return pick.url;
      }
    } catch (err) {
      console.warn(`[inv] ${host}:`, String(err).slice(0, 60));
    }
  }
  return null;
}

// ── 3. YouTube watch page — extract ytInitialPlayerResponse ─────────────────
async function tryWatchPage(videoId: string): Promise<MaybeUrl> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;(?:var |<\/script>)/s);
    if (!match) { console.warn('[page] ytInitialPlayerResponse not found'); return null; }

    interface Fmt { url?: string; mimeType?: string; height?: number }
    const pr = JSON.parse(match[1]) as { streamingData?: { formats?: Fmt[]; adaptiveFormats?: Fmt[] } };
    const formats = [
      ...(pr.streamingData?.formats ?? []),
      ...(pr.streamingData?.adaptiveFormats ?? []),
    ];

    const fmt = formats
      .filter((f) => f.url && f.mimeType?.startsWith('video/mp4') && (f.height ?? 999) <= 720)
      .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];

    if (fmt?.url) { console.log(`[page] ✓ ${fmt.height}p`); return fmt.url; }
  } catch (err) {
    console.warn('[page]', String(err).slice(0, 80));
  }
  return null;
}

// ── 4. INNERTUBE direct (works for non-ciphered videos) ─────────────────────
async function tryInnertube(videoId: string): Promise<MaybeUrl> {
  const clients = [
    { name: 'ANDROID', version: '19.44.38', xname: '3',
      ua: 'com.google.android.youtube/19.44.38 (Linux; U; Android 11) gzip' },
    { name: 'IOS', version: '19.45.4', xname: '5',
      ua: 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)' },
  ];

  for (const c of clients) {
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': c.ua,
          'X-YouTube-Client-Name': c.xname,
          'X-YouTube-Client-Version': c.version,
        },
        body: JSON.stringify({
          videoId,
          context: { client: { clientName: c.name, clientVersion: c.version,
            androidSdkVersion: c.name === 'ANDROID' ? 30 : undefined,
            hl: 'en', gl: 'US' } },
        }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) continue;

      interface IF { url?: string; mimeType?: string; height?: number }
      interface IR { playabilityStatus?: { status: string }; streamingData?: { formats?: IF[]; adaptiveFormats?: IF[] } }
      const data = (await res.json()) as IR;
      if (data.playabilityStatus?.status !== 'OK') continue;

      const fmt = [
        ...(data.streamingData?.formats ?? []),
        ...(data.streamingData?.adaptiveFormats ?? []),
      ]
        .filter((f) => f.url && f.mimeType?.startsWith('video/mp4') && (f.height ?? 999) <= 720)
        .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];

      if (fmt?.url) { console.log(`[innertube] ✓ ${c.name} ${fmt.height}p`); return fmt.url; }
    } catch { /* next */ }
  }
  return null;
}

export async function downloadYouTube(url: string): Promise<DownloadResultRemote> {
  const videoId = extractYouTubeId(url);
  if (!videoId) throw new DownloadError('Cannot extract YouTube video ID', 'unsupported');
  console.log('[youtube] id:', videoId);

  const errors: string[] = [];

  const attempts: Array<[string, () => Promise<MaybeUrl>]> = [
    ['Piped', () => tryPiped(videoId)],
    ['Invidious', () => tryInvidious(videoId)],
    ['WatchPage', () => tryWatchPage(videoId)],
    ['Innertube', () => tryInnertube(videoId)],
  ];

  for (const [label, fn] of attempts) {
    try {
      const u = await fn();
      if (u) return { kind: 'remote', url: u, filename: `yt_${videoId}.mp4`, mediaType: 'video' };
      errors.push(`${label}: no url`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${label}: ${msg}`);
    }
  }

  throw new DownloadError(`YouTube failed:\n${errors.join('\n')}`, 'generic');
}
