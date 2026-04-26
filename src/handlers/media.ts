import { rmSync } from 'node:fs';
import type { Bot, Context } from 'grammy';
import { InputFile } from 'grammy';
import type { DbAdapter, DownloaderFn } from '../types.ts';
import { DownloadError } from '../types.ts';
import { t } from '../i18n/index.ts';
import type { Language } from '../types.ts';
import { isSupported } from '../utils/url.ts';
import { getCached, setCache } from '../services/cache.ts';

export function registerMediaHandlers(bot: Bot<Context>, db: DbAdapter, downloader: DownloaderFn): void {
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;

    const chatId = ctx.chat.id;
    const user = await db.getUser(chatId);
    const lang = (user?.language ?? 'en') as Language;

    if (!isSupported(text)) {
      await ctx.reply(t(lang, 'wrong'));
      return;
    }

    // Serve from cache when possible
    const cached = await getCached(db, text);
    if (cached) {
      if (cached.mediaType === 'video') await ctx.replyWithVideo(cached.fileId);
      else if (cached.mediaType === 'photo') await ctx.replyWithPhoto(cached.fileId);
      else await ctx.replyWithAudio(cached.fileId);
      return;
    }

    const statusMsg = await ctx.reply(t(lang, 'downloading'));

    try {
      const result = await downloader(text);

      let sentFileId: string;

      if (result.kind === 'local') {
        // VPS path: upload file to Telegram
        if (result.mediaType === 'video') {
          const msg = await ctx.replyWithVideo(new InputFile(result.filePath));
          sentFileId = msg.video.file_id;
        } else if (result.mediaType === 'photo') {
          const msg = await ctx.replyWithPhoto(new InputFile(result.filePath));
          sentFileId = msg.photo.at(-1)!.file_id;
        } else {
          const msg = await ctx.replyWithAudio(new InputFile(result.filePath));
          sentFileId = msg.audio.file_id;
        }
        // Clean up local file
        try { rmSync(result.sessionDir, { recursive: true, force: true }); } catch { /* best-effort */ }
      } else {
        // Workers path: pass remote URL directly to Telegram
        if (result.mediaType === 'video') {
          const msg = await ctx.replyWithVideo(result.url);
          sentFileId = msg.video.file_id;
        } else if (result.mediaType === 'photo') {
          const msg = await ctx.replyWithPhoto(result.url);
          sentFileId = msg.photo.at(-1)!.file_id;
        } else {
          const msg = await ctx.replyWithAudio(result.url);
          sentFileId = msg.audio.file_id;
        }
      }

      await setCache(db, text, sentFileId, result.mediaType);
    } catch (err) {
      const key =
        err instanceof DownloadError
          ? err.kind === 'unsupported' ? 'unsupported' : err.kind === 'too_large' ? 'tooLarge' : 'error'
          : 'error';
      await ctx.reply(t(lang, key));
    } finally {
      try { await ctx.api.deleteMessage(chatId, statusMsg.message_id); } catch { /* best-effort */ }
    }
  });
}
