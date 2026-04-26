// Workers-specific media handler.
// Cache hits are served instantly from D1 + Telegram file_id.
// Cache misses are forwarded to DOWNLOAD_SERVICE_URL (a Bun VPS running src/index.ts).
// This keeps the Worker lightweight — no yt-dlp, no filesystem.

import type { Bot, Context } from 'grammy';
import { getDb } from '../db.js';
import { t } from '../i18n.js';
import { detectPlatform, computeUrlHash, isUrl } from '../utils/detect.js';
import { forwardCachedMedia } from '../utils/forward.js';

export function registerWorkerMediaHandlers(bot: Bot<Context>): void {
  bot.on('message:text', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const db = getDb();
    const user = await db.getUser(from.id);
    const lang = user?.language ?? 'uz';

    if (user?.is_blocked) {
      await ctx.reply(t(lang, 'user_blocked'));
      return;
    }

    await db.updateUserActivity(from.id);

    const text = ctx.message.text.trim();

    if (!isUrl(text)) {
      await ctx.reply(t(lang, 'send_url_prompt'));
      return;
    }

    const detected = detectPlatform(text);
    if (!detected) {
      await ctx.reply(t(lang, 'error_unsupported'));
      return;
    }

    const { normalizedUrl } = detected;
    const urlHash = await computeUrlHash(normalizedUrl);

    // ── Cache hit: serve instantly ─────────────────────────────────────────
    const cached = await db.getCachedMedia(urlHash);
    if (cached) {
      await db.incrementCacheCount(urlHash);
      await db.logRequest({ userId: from.id, urlHash, wasCached: true });
      await ctx.reply(t(lang, 'from_cache', { title: cached.title ?? normalizedUrl }));
      await forwardCachedMedia(
        ctx,
        cached.telegram_file_id,
        cached.file_type as 'video' | 'audio' | 'photo',
        cached.title ?? undefined,
      );
      return;
    }

    // ── Cache miss: forward to download service ────────────────────────────
    const downloadServiceUrl = (globalThis as Record<string, unknown>)['DOWNLOAD_SERVICE_URL'] as string | undefined
      ?? (typeof process !== 'undefined' ? process.env['DOWNLOAD_SERVICE_URL'] : undefined);

    if (!downloadServiceUrl) {
      await ctx.reply(t(lang, 'error_download'));
      console.error('[worker/media] DOWNLOAD_SERVICE_URL not configured');
      return;
    }

    await ctx.reply(t(lang, 'downloading'));

    try {
      const resp = await fetch(`${downloadServiceUrl}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: normalizedUrl,
          chat_id: ctx.chat.id,
          user_id: from.id,
          lang,
        }),
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        if (body.includes('unsupported')) {
          await ctx.reply(t(lang, 'error_unsupported'));
        } else if (body.includes('too_large') || body.includes('size')) {
          await ctx.reply(t(lang, 'error_size'));
        } else {
          await ctx.reply(t(lang, 'error_download'));
        }
        console.error(`[worker/media] Download service error ${resp.status}: ${body}`);
      }
      // On success the download service sends the video directly to the user
      // and updates D1 cache — the Worker doesn't need to do anything else.
    } catch (err) {
      await ctx.reply(t(lang, 'error_download'));
      console.error(`[worker/media] Fetch error: ${(err as Error).message}`);
    }
  });
}
