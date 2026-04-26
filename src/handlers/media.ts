import { rmSync } from 'node:fs';
import type { Bot, Context } from 'grammy';
import { InputFile } from 'grammy';
import type { DbAdapter } from '../types.ts';
import { DownloadError } from '../types.ts';
import { t } from '../i18n/index.ts';
import type { Language } from '../types.ts';
import { isSupported, download } from '../services/downloader.ts';
import { getCached, setCache } from '../services/cache.ts';

export function registerMediaHandlers(bot: Bot<Context>, db: DbAdapter): void {
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();

    // Ignore commands — handled elsewhere
    if (text.startsWith('/')) return;

    const chatId = ctx.chat.id;
    const user = await db.getUser(chatId);
    const lang = (user?.language ?? 'en') as Language;

    if (!isSupported(text)) {
      await ctx.reply(t(lang, 'wrong'));
      return;
    }

    // Check cache first
    const cached = await getCached(db, text);
    if (cached) {
      if (cached.mediaType === 'video') {
        await ctx.replyWithVideo(cached.fileId);
      } else if (cached.mediaType === 'photo') {
        await ctx.replyWithPhoto(cached.fileId);
      } else {
        await ctx.replyWithAudio(cached.fileId);
      }
      return;
    }

    const statusMsg = await ctx.reply(t(lang, 'downloading'));

    let filePath: string | null = null;
    try {
      const result = await download(text);
      filePath = result.filePath;

      let sentFileId: string;

      if (result.mediaType === 'video') {
        const msg = await ctx.replyWithVideo(new InputFile(filePath));
        sentFileId = msg.video.file_id;
      } else if (result.mediaType === 'photo') {
        const msg = await ctx.replyWithPhoto(new InputFile(filePath));
        sentFileId = msg.photo.at(-1)!.file_id;
      } else {
        const msg = await ctx.replyWithAudio(new InputFile(filePath));
        sentFileId = msg.audio.file_id;
      }

      await setCache(db, text, sentFileId, result.mediaType);
    } catch (err) {
      if (err instanceof DownloadError) {
        const msgKey =
          err.kind === 'unsupported'
            ? 'unsupported'
            : err.kind === 'too_large'
              ? 'tooLarge'
              : 'error';
        await ctx.reply(t(lang, msgKey));
      } else {
        await ctx.reply(t(lang, 'error'));
      }
    } finally {
      // Delete the "Downloading..." status message
      try {
        await ctx.api.deleteMessage(chatId, statusMsg.message_id);
      } catch { /* best-effort */ }

      // Clean up downloaded file
      if (filePath) {
        const sessionDir = filePath.substring(0, filePath.lastIndexOf('/'));
        try { rmSync(sessionDir, { recursive: true, force: true }); } catch { /* best-effort */ }
      }
    }
  });
}
