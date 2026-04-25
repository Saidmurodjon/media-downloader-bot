import path from 'path';
import { existsSync } from 'fs';

export interface DownloadResult {
  filePath: string;
  title: string;
  ext: string;
  fileSizeBytes: number;
}

export type DownloadErrorKind =
  | 'unsupported'
  | 'too_large'
  | 'generic';

export class DownloadError extends Error {
  constructor(
    public readonly kind: DownloadErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'DownloadError';
  }
}

const MAX_FILE_SIZE_MB = Number(process.env['MAX_FILE_SIZE_MB'] ?? 50);

export async function downloadMedia(
  url: string,
  outDir: string,
): Promise<DownloadResult> {
  const proc = Bun.spawn(
    [
      'yt-dlp',
      '--no-playlist',
      '--max-filesize', `${MAX_FILE_SIZE_MB}m`,
      '-o', `${outDir}/%(title)s.%(ext)s`,
      '--print', 'filename',
      '--no-warnings',
      '--no-part',
      '--merge-output-format', 'mp4',
      url,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );

  const [stdoutText, stderrText] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  await proc.exited;

  if (proc.exitCode !== 0) {
    const err = stderrText.toLowerCase();
    if (
      err.includes('unsupported url') ||
      err.includes('is not a valid url') ||
      err.includes('no matching formats')
    ) {
      throw new DownloadError('unsupported', `Unsupported URL: ${stderrText}`);
    }
    if (
      err.includes('file is larger than') ||
      err.includes('maxfilesize') ||
      err.includes('exceeds')
    ) {
      throw new DownloadError('too_large', `File too large: ${stderrText}`);
    }
    throw new DownloadError('generic', `yt-dlp failed (exit ${proc.exitCode}): ${stderrText}`);
  }

  const lines = stdoutText.trim().split('\n').filter(Boolean);
  const filePath = lines[lines.length - 1]!.trim();

  if (!filePath || !existsSync(filePath)) {
    throw new DownloadError('generic', `Downloaded file not found at: ${filePath}`);
  }

  const file = Bun.file(filePath);
  const fileSizeBytes = file.size;

  if (fileSizeBytes > MAX_FILE_SIZE_MB * 1024 * 1024) {
    throw new DownloadError(
      'too_large',
      `File size ${(fileSizeBytes / 1_048_576).toFixed(1)} MB exceeds limit`,
    );
  }

  const ext = path.extname(filePath);
  const title = path.basename(filePath, ext);

  return { filePath, title, ext, fileSizeBytes };
}

export function inferFileType(ext: string): 'video' | 'audio' | 'photo' {
  const e = ext.toLowerCase().replace('.', '');
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'ts'].includes(e)) return 'video';
  if (['mp3', 'm4a', 'ogg', 'wav', 'flac', 'aac', 'opus'].includes(e)) return 'audio';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(e)) return 'photo';
  return 'video';
}
