import { mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DownloadError, type DownloadResultLocal } from '../types.ts';
import { isSupported } from '../utils/url.ts';

const MAX_FILE_BYTES = Number(process.env.MAX_FILE_SIZE_MB ?? 50) * 1024 * 1024;
export const TEMP_DIR = process.env.TEMP_DIR ?? './tmp';
const TEMP_TTL_MS = Number(process.env.TEMP_TTL_MINUTES ?? 60) * 60 * 1000;

export async function download(url: string): Promise<DownloadResultLocal> {
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
      const chunks: Uint8Array[] = [];
      for await (const chunk of proc.stderr) chunks.push(chunk);
      const stderr = new TextDecoder().decode(Buffer.concat(chunks));
      if (stderr.includes('File is larger than max-filesize')) {
        throw new DownloadError('File too large', 'too_large');
      }
      throw new DownloadError(`yt-dlp exited ${exitCode}: ${stderr}`, 'generic');
    }

    const files = readdirSync(sessionDir);
    if (files.length === 0) throw new DownloadError('No file produced', 'generic');

    const filePath = join(sessionDir, files[0]);
    const ext = files[0].split('.').pop()?.toLowerCase() ?? '';
    const mediaType: DownloadResultLocal['mediaType'] =
      ['mp3', 'ogg', 'm4a', 'aac', 'flac', 'wav'].includes(ext)
        ? 'audio'
        : ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
          ? 'photo'
          : 'video';

    return { kind: 'local', filePath, sessionDir, mediaType };
  } catch (err) {
    rmSync(sessionDir, { recursive: true, force: true });
    throw err;
  }
}

export function cleanupTempDir(): void {
  try {
    const now = Date.now();
    for (const entry of readdirSync(TEMP_DIR)) {
      const full = join(TEMP_DIR, entry);
      try {
        if (now - statSync(full).mtimeMs > TEMP_TTL_MS) {
          rmSync(full, { recursive: true, force: true });
        }
      } catch { /* skip */ }
    }
  } catch { /* dir doesn't exist yet */ }
}
