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

// ── 1. TVHTML5_SIMPLY_EMBEDDED_PLAYER — known to return plain (non-ciphered) URLs ──
async function tryTVEmbed(videoId: string): Promise<MaybeUrl> {
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (PlayStation 4 3.11) AppleWebKit/537.73 (KHTML, like Gecko)',
        'X-YouTube-Client-Name': '85',
        'X-YouTube-Client-Version': '2.0',
        'Origin': 'https://www.youtube.com',
        'Referer': `https://www.youtube.com/embed/${videoId}`,
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
            clientVersion: '2.0',
            hl: 'en', gl: 'US',
            clientScreen: 'EMBED',
          },
          thirdParty: { embedUrl: `https://www.youtube.com/embed/${videoId}` },
        },
        playbackContext: {
          contentPlaybackContext: { signatureTimestamp: 20015 },
        },
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) { console.warn(`[tvembed] HTTP ${res.status}`); return null; }

    interface Fmt { url?: string; signatureCipher?: string; mimeType?: string; height?: number }
    interface IR { playabilityStatus?: { status: string; reason?: string }; streamingData?: { formats?: Fmt[]; adaptiveFormats?: Fmt[] } }
    const data = (await res.json()) as IR;

    const status = data.playabilityStatus?.status;
    if (status !== 'OK') {
      console.warn(`[tvembed] status=${status} reason=${data.playabilityStatus?.reason}`);
      return null;
    }

    const formats = [
      ...(data.streamingData?.formats ?? []),
      ...(data.streamingData?.adaptiveFormats ?? []),
    ];

    const fmt = formats
      .filter((f) => f.url && f.mimeType?.startsWith('video/mp4') && (f.height ?? 999) <= 720)
      .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];

    if (fmt?.url) { console.log(`[tvembed] ✓ ${fmt.height}p`); return fmt.url; }

    const ciphered = formats.filter(f => f.signatureCipher).length;
    const direct = formats.filter(f => f.url).length;
    console.warn(`[tvembed] no mp4: total=${formats.length} direct=${direct} ciphered=${ciphered}`);
  } catch (err) {
    console.warn('[tvembed]', String(err).slice(0, 80));
  }
  return null;
}

// ── 2. WEB_EMBEDDED_PLAYER ────────────────────────────────────────────────────
async function tryWebEmbed(videoId: string): Promise<MaybeUrl> {
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'X-YouTube-Client-Name': '56',
        'X-YouTube-Client-Version': '1.20240417.00.00',
        'Origin': 'https://www.youtube.com',
        'Referer': `https://www.youtube.com/embed/${videoId}`,
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName: 'WEB_EMBEDDED_PLAYER',
            clientVersion: '1.20240417.00.00',
            hl: 'en', gl: 'US',
            clientScreen: 'EMBED',
          },
          thirdParty: { embedUrl: `https://www.youtube.com/embed/${videoId}` },
        },
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) { console.warn(`[webembed] HTTP ${res.status}`); return null; }

    interface Fmt { url?: string; signatureCipher?: string; mimeType?: string; height?: number }
    interface IR { playabilityStatus?: { status: string }; streamingData?: { formats?: Fmt[]; adaptiveFormats?: Fmt[] } }
    const data = (await res.json()) as IR;

    if (data.playabilityStatus?.status !== 'OK') {
      console.warn(`[webembed] status=${data.playabilityStatus?.status}`);
      return null;
    }

    const formats = [
      ...(data.streamingData?.formats ?? []),
      ...(data.streamingData?.adaptiveFormats ?? []),
    ];

    const fmt = formats
      .filter((f) => f.url && f.mimeType?.startsWith('video/mp4') && (f.height ?? 999) <= 720)
      .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];

    if (fmt?.url) { console.log(`[webembed] ✓ ${fmt.height}p`); return fmt.url; }

    const ciphered = formats.filter(f => f.signatureCipher).length;
    console.warn(`[webembed] no mp4: total=${formats.length} ciphered=${ciphered}`);
  } catch (err) {
    console.warn('[webembed]', String(err).slice(0, 80));
  }
  return null;
}

// ── 3. Piped API (open-source YouTube frontend, handles sig decryption) ───────
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

      const streams = data.videoStreams ?? [];
      console.log(`[piped] ${host} streams=${streams.length} formats=${[...new Set(streams.map(s => s.format))].join(',')}`);

      // Prefer muxed MP4 first, then any muxed stream (video+audio)
      const pick =
        streams.find((s) => s.format === 'MP4' && !s.videoOnly && /720|480|360/.test(s.quality)) ??
        streams.find((s) => s.format === 'MP4' && !s.videoOnly) ??
        streams.find((s) => !s.videoOnly && s.url) ??
        streams.find((s) => s.format === 'MP4' && s.url) ??
        streams.find((s) => s.url);

      if (pick?.url) {
        console.log(`[piped] ✓ ${host} ${pick.quality} ${pick.format} videoOnly=${pick.videoOnly}`);
        return pick.url;
      }
    } catch (err) {
      console.warn(`[piped] ${host}:`, String(err).slice(0, 60));
    }
  }
  return null;
}

// ── 4. Invidious ──────────────────────────────────────────────────────────────
const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://iv.datura.network',
  'https://invidious.nerdvpn.de',
  'https://invidious.baczek.me',
  'https://yt.cdaut.de',
  'https://invidious.privacyredirect.com',
  'https://yt.artemislena.eu',
  'https://invidious.fdn.fr',
  'https://vid.puffyan.us',
];

async function tryInvidious(videoId: string): Promise<MaybeUrl> {
  for (const host of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(
        `${host}/api/v1/videos/${videoId}?fields=formatStreams,adaptiveFormats`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) { console.warn(`[inv] ${host} → ${res.status}`); continue; }

      interface IStream { url: string; qualityLabel: string; container: string }
      const data = (await res.json()) as { formatStreams?: IStream[]; adaptiveFormats?: IStream[] };
      const muxed = (data.formatStreams ?? []).filter((f) => f.url && f.container === 'mp4');
      console.log(`[inv] ${host} muxed=${muxed.length} adaptive=${(data.adaptiveFormats ?? []).length}`);

      const pick =
        muxed.find((f) => f.qualityLabel === '720p') ??
        muxed.find((f) => f.qualityLabel === '480p') ??
        muxed.find((f) => f.qualityLabel === '360p') ??
        muxed[0];

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

// ── 5. YouTube watch page — extract ytInitialPlayerResponse ──────────────────
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
    if (!res.ok) { console.warn(`[page] HTTP ${res.status}`); return null; }
    const html = await res.text();

    const match =
      html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;(?:var |<\/script>)/s) ??
      html.match(/ytInitialPlayerResponse\s*=\s*(\{.+\})\s*;\s*(?:var\s+ytInitialData|<\/script>)/s);

    if (!match) { console.warn('[page] ytInitialPlayerResponse not found'); return null; }

    interface Fmt { url?: string; signatureCipher?: string; mimeType?: string; height?: number }
    const pr = JSON.parse(match[1]) as { streamingData?: { formats?: Fmt[]; adaptiveFormats?: Fmt[] } };
    const formats = [
      ...(pr.streamingData?.formats ?? []),
      ...(pr.streamingData?.adaptiveFormats ?? []),
    ];

    console.log(`[page] total=${formats.length} direct=${formats.filter(f=>f.url).length} ciphered=${formats.filter(f=>f.signatureCipher).length}`);

    const fmt = formats
      .filter((f) => f.url && f.mimeType?.startsWith('video/mp4') && (f.height ?? 999) <= 720)
      .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];

    if (fmt?.url) { console.log(`[page] ✓ ${fmt.height}p`); return fmt.url; }
  } catch (err) {
    console.warn('[page]', String(err).slice(0, 80));
  }
  return null;
}

// ── 6. INNERTUBE mobile/VR clients ───────────────────────────────────────────
async function tryInnertube(videoId: string): Promise<MaybeUrl> {
  const clients = [
    { name: 'ANDROID', version: '19.44.38', xname: '3',
      ua: 'com.google.android.youtube/19.44.38 (Linux; U; Android 11) gzip' },
    { name: 'IOS', version: '19.45.4', xname: '5',
      ua: 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)' },
    { name: 'ANDROID_VR', version: '1.57.29', xname: '28',
      ua: 'com.google.android.apps.youtube.vr.oculus/1.57.29 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip' },
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
            androidSdkVersion: c.name.startsWith('ANDROID') ? 30 : undefined,
            hl: 'en', gl: 'US' } },
        }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) continue;

      interface Fmt { url?: string; signatureCipher?: string; mimeType?: string; height?: number }
      interface IR { playabilityStatus?: { status: string }; streamingData?: { formats?: Fmt[]; adaptiveFormats?: Fmt[] } }
      const data = (await res.json()) as IR;
      if (data.playabilityStatus?.status !== 'OK') continue;

      const formats = [
        ...(data.streamingData?.formats ?? []),
        ...(data.streamingData?.adaptiveFormats ?? []),
      ];

      console.log(`[innertube] ${c.name} total=${formats.length} direct=${formats.filter(f=>f.url).length} ciphered=${formats.filter(f=>f.signatureCipher).length}`);

      const fmt = formats
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
    ['TVEmbed',   () => tryTVEmbed(videoId)],
    ['WebEmbed',  () => tryWebEmbed(videoId)],
    ['Piped',     () => tryPiped(videoId)],
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
