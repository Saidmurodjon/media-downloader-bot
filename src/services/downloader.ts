import { mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DownloadError, type DownloadResult } from '../types.ts';

const YOUTUBE_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)[\w-]+/i;
const INSTAGRAM_RE = /instagram\.com\/(?:p|reel|stories)\/[\w-]+/i;

const MAX_FILE_BYTES = Number(process.env.MAX_FILE_SIZE_MB ?? 50) * 1024 * 1024;
const TEMP_DIR = process.env.TEMP_DIR ?? './tmp';
const TEMP_TTL_MS = Number(process.env.TEMP_TTL_MINUTES ?? 60) * 60 * 1000;

export function isSupported(url: string): boolean {
  return YOUTUBE_RE.test(url) || INSTAGRAM_RE.test(url);
}

export async function download(url: string): Promise<DownloadResult> {
  if (!isSupported(url)) {
    throw new DownloadError('Unsupported URL', 'unsupported');
  }

  const sessionDir = join(TEMP_DIR, `dl_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  mkdirSync(sessionDir, { recursive: true });

  try {
    const proc = Bun.spawn(
      [
        'yt-dlp',
        '--no-playlist',
        '--max-filesize', String(MAX_FILE_BYTES),
        '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '-o', join(sessionDir, '%(title)s.%(ext)s'),
        url,
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderrChunks: Uint8Array[] = [];
      for await (const chunk of proc.stderr) stderrChunks.push(chunk);
      const stderr = new TextDecoder().decode(Buffer.concat(stderrChunks));
      if (stderr.includes('File is larger than max-filesize')) {
        throw new DownloadError('File too large', 'too_large');
      }
      throw new DownloadError(`yt-dlp exited with code ${exitCode}: ${stderr}`, 'generic');
    }

    const files = readdirSync(sessionDir);
    if (files.length === 0) {
      throw new DownloadError('No file produced by yt-dlp', 'generic');
    }

    const filePath = join(sessionDir, files[0]);
    const ext = files[0].split('.').pop()?.toLowerCase() ?? '';
    const mediaType: DownloadResult['mediaType'] =
      ['mp3', 'ogg', 'm4a', 'aac', 'flac', 'wav'].includes(ext)
        ? 'audio'
        : ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
          ? 'photo'
          : 'video';

    return { filePath, mediaType };
  } catch (err) {
    rmSync(sessionDir, { recursive: true, force: true });
    throw err;
  }
}

export function cleanupTempDir(): void {
  try {
    const entries = readdirSync(TEMP_DIR);
    const now = Date.now();
    for (const entry of entries) {
      const full = join(TEMP_DIR, entry);
      try {
        const stat = statSync(full);
        if (now - stat.mtimeMs > TEMP_TTL_MS) {
          rmSync(full, { recursive: true, force: true });
        }
      } catch {
        // skip entries we can't stat
      }
    }
  } catch {
    // TEMP_DIR doesn't exist yet — nothing to clean
  }
}
