import type { Bot, Context } from 'grammy';
import { InputFile } from 'grammy';
import type { DbAdapter, DownloaderFn, DownloadResultRemote } from '../types.ts';
import { DownloadError } from '../types.ts';
import { t } from '../i18n/index.ts';
import type { Language } from '../types.ts';
import { isSupported } from '../utils/url.ts';
import { getCached, setCache } from '../services/cache.ts';

async function proxyToInputFile(result: DownloadResultRemote): Promise<InputFile> {
  console.log('[proxy] fetching:', result.url.slice(0, 100));
  const res = await fetch(result.url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TelegramBot/1.0)' },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new DownloadError(`proxy HTTP ${res.status}`, 'generic');
  const buf = await res.arrayBuffer();
  const ext =
    result.mediaType === 'video' ? 'mp4'
    : result.mediaType === 'photo' ? 'jpg'
    : 'mp3';
  const filename = result.filename ?? `media.${ext}`;
  console.log('[proxy] ✓', buf.byteLength, 'bytes →', filename);
  return new InputFile(new Uint8Array(buf), filename);
}

async function sendRemote(ctx: Context, result: DownloadResultRemote): Promise<string> {
  const send = async (source: string | InputFile) => {
    if (result.mediaType === 'video') {
      const msg = await ctx.replyWithVideo(source);
      return msg.video.file_id;
    } else if (result.mediaType === 'photo') {
      const msg = await ctx.replyWithPhoto(source);
      return msg.photo.at(-1)!.file_id;
    } else {
      const msg = await ctx.replyWithAudio(source as string);
      return msg.audio.file_id;
    }
  };

  // Try 1: pass URL directly to Telegram
  try {
    return await send(result.url);
  } catch (urlErr) {
    console.warn('[media] direct URL rejected by Telegram, proxying:', String(urlErr).slice(0, 120));
  }

  // Try 2: fetch in Worker → upload as binary
  const file = await proxyToInputFile(result);
  return await send(file);
}

export function registerMediaHandlers(bot: Bot<Context>, db: DbAdapter, downloader: DownloaderFn): void {
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;

    const chatId = ctx.chat.id;
    const user = await db.getUser(chatId);
    const lang = (user?.language ?? 'en') as Language;
    const isAdmin = user?.isAdmin === 1;

    if (!isSupported(text)) {
      await ctx.reply(t(lang, 'wrong'));
      return;
    }

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
        if (result.mediaType === 'video') {
          const { rmSync } = await import('node:fs');
          const msg = await ctx.replyWithVideo(new InputFile(result.filePath));
          sentFileId = msg.video.file_id;
          try { rmSync(result.sessionDir, { recursive: true, force: true }); } catch { /* ok */ }
        } else if (result.mediaType === 'photo') {
          const msg = await ctx.replyWithPhoto(new InputFile(result.filePath));
          sentFileId = msg.photo.at(-1)!.file_id;
        } else {
          const msg = await ctx.replyWithAudio(new InputFile(result.filePath));
          sentFileId = msg.audio.file_id;
        }
      } else {
        sentFileId = await sendRemote(ctx, result);
      }

      await setCache(db, text, sentFileId, result.mediaType);
    } catch (err) {
      console.error('[media] final error:', err);

      // Admin sees the real error — helps diagnose production issues
      if (isAdmin && err instanceof Error) {
        await ctx.reply(`⚠️ [debug] ${err.name}: ${err.message}`.slice(0, 4000));
      } else {
        const key =
          err instanceof DownloadError
            ? err.kind === 'unsupported' ? 'unsupported'
            : err.kind === 'too_large' ? 'tooLarge'
            : 'error'
            : 'error';
        await ctx.reply(t(lang, key));
      }
    } finally {
      try { await ctx.api.deleteMessage(chatId, statusMsg.message_id); } catch { /* ok */ }
    }
  });
}
