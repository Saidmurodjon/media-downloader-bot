import path from 'path';
import { mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import type { Bot, Context } from 'grammy';
import { getDb } from '../db.js';
import { t } from '../i18n.js';
import { detectPlatform, computeUrlHash, isUrl } from '../utils/detect.js';
import { downloadMedia, DownloadError, inferFileType } from '../downloader.js';
import { cleanupDir, getTmpDir } from '../utils/cleanup.js';
import { forwardCachedMedia, uploadMedia } from '../utils/forward.js';

const inProgress = new Set<string>();

export function registerMediaHandlers(bot: Bot<Context>): void {
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

    const { platform, normalizedUrl } = detected;
    const urlHash = await computeUrlHash(normalizedUrl);

    if (inProgress.has(urlHash)) {
      await ctx.reply(t(lang, 'downloading_wait'));
      return;
    }

    const processing = await ctx.reply(t(lang, 'processing'));

    try {
      const cached = await db.getCachedMedia(urlHash);
      if (cached) {
        await db.incrementCacheCount(urlHash);
        await db.logRequest({ userId: from.id, urlHash, wasCached: true });

        await ctx.api.editMessageText(
          ctx.chat.id,
          processing.message_id,
          t(lang, 'from_cache', { title: cached.title ?? normalizedUrl }),
        );
        await forwardCachedMedia(
          ctx,
          cached.telegram_file_id,
          cached.file_type as 'video' | 'audio' | 'photo',
          cached.title ?? undefined,
        );
        return;
      }

      inProgress.add(urlHash);

      await ctx.api.editMessageText(
        ctx.chat.id,
        processing.message_id,
        t(lang, 'downloading'),
      );
      await ctx.replyWithChatAction('upload_video');

      const tmpBase = getTmpDir();
      const outDir = path.join(tmpBase, randomUUID());
      mkdirSync(outDir, { recursive: true });

      let downloadResult: Awaited<ReturnType<typeof downloadMedia>>;
      try {
        downloadResult = await downloadMedia(normalizedUrl, outDir);
      } catch (err) {
        inProgress.delete(urlHash);
        await cleanupDir(outDir);

        if (err instanceof DownloadError) {
          const msgKey =
            err.kind === 'unsupported' ? 'error_unsupported'
            : err.kind === 'too_large' ? 'error_size'
            : 'error_download';
          await ctx.api.editMessageText(
            ctx.chat.id, processing.message_id, t(lang, msgKey),
          );
        } else {
          await ctx.api.editMessageText(
            ctx.chat.id, processing.message_id, t(lang, 'error_download'),
          );
        }
        console.error(
          `[media] Download error user=${from.id} url=${normalizedUrl}: ${(err as Error).message}`,
        );
        return;
      }

      await ctx.api.editMessageText(
        ctx.chat.id,
        processing.message_id,
        t(lang, 'uploading'),
      );

      const fileType = inferFileType(downloadResult.ext);
      let fileId: string;

      try {
        fileId = await uploadMedia(
          ctx,
          downloadResult.filePath,
          fileType,
          downloadResult.title,
        );
      } finally {
        inProgress.delete(urlHash);
        await cleanupDir(outDir);
      }

      await db.saveMediaCache({
        urlHash,
        originalUrl: normalizedUrl,
        platform,
        telegramFileId: fileId,
        fileType,
        title: downloadResult.title,
      });

      await db.logRequest({ userId: from.id, urlHash, wasCached: false });

      await ctx.api.editMessageText(
        ctx.chat.id,
        processing.message_id,
        t(lang, 'done', { title: downloadResult.title }),
      );
    } catch (err) {
      inProgress.delete(urlHash);
      console.error(
        `[media] Unexpected error user=${from.id} url=${normalizedUrl}: ${(err as Error).message}`,
      );
      try {
        await ctx.api.editMessageText(
          ctx.chat.id, processing.message_id, t(lang, 'unknown_error'),
        );
      } catch {
        await ctx.reply(t(lang, 'unknown_error'));
      }
    }
  });
}
