import { rmSync, readdirSync, statSync, existsSync } from 'fs';
import path from 'path';

export async function cleanupDir(dirPath: string): Promise<void> {
  try {
    if (!existsSync(dirPath)) return;
    rmSync(dirPath, { recursive: true, force: true });
  } catch (err) {
    console.error(
      `[cleanup] Failed to remove ${dirPath}: ${(err as Error).message}`,
    );
  }
}

export async function cleanupStaleTmpDirs(
  baseTmpDir: string,
  maxAgeMs = 60 * 60 * 1000,
): Promise<void> {
  if (!existsSync(baseTmpDir)) return;

  let entries: string[];
  try {
    entries = readdirSync(baseTmpDir);
  } catch (err) {
    console.error(
      `[cleanup] Cannot read ${baseTmpDir}: ${(err as Error).message}`,
    );
    return;
  }

  const now = Date.now();
  for (const entry of entries) {
    const fullPath = path.join(baseTmpDir, entry);
    try {
      const stat = statSync(fullPath);
      const ageMs = now - stat.mtimeMs;
      if (ageMs > maxAgeMs) {
        rmSync(fullPath, { recursive: true, force: true });
        console.log(`[cleanup] Removed stale tmp dir: ${fullPath}`);
      }
    } catch (err) {
      console.error(
        `[cleanup] Failed to stat/remove ${fullPath}: ${(err as Error).message}`,
      );
    }
  }
}

export function getTmpDir(): string {
  return process.env['TMP_DIR'] ?? '/tmp/mediabot';
}
