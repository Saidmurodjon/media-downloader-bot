import type { Bot, Context } from 'grammy';
import { InputFile } from 'grammy';
import type { DbAdapter, DownloaderFn, DownloadResultRemote } from '../types.ts';
import { DownloadError } from '../types.ts';
import { t } from '../i18n/index.ts';
import type { Language } from '../types.ts';
import { isSupported } from '../utils/url.ts';
import { getCached, setCache } from '../services/cache.ts';

// Fetch remote media and wrap as InputFile for Telegram upload
async function proxyToInputFile(result: DownloadResultRemote): Promise<InputFile> {
  console.log('[proxy] fetching:', result.url.slice(0, 80));
  const res = await fetch(result.url, {
    headers: { 'User-Agent': 'TelegramBot/1.0' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new DownloadError(`proxy fetch ${res.status}`, 'generic');
  const buf = await res.arrayBuffer();
  const ext =
    result.mediaType === 'video' ? 'mp4'
    : result.mediaType === 'photo' ? 'jpg'
    : 'mp3';
  const filename = result.filename ?? `media.${ext}`;
  console.log('[proxy] got', buf.byteLength, 'bytes as', filename);
  return new InputFile(new Uint8Array(buf), filename);
}

// Send one piece of media — try URL first, fall back to proxy blob
async function sendRemote(ctx: Context, result: DownloadResultRemote): Promise<string> {
  const tryUrl = async () => {
    if (result.mediaType === 'video') {
      const msg = await ctx.replyWithVideo(result.url);
      return msg.video.file_id;
    } else if (result.mediaType === 'photo') {
      const msg = await ctx.replyWithPhoto(result.url);
      return msg.photo.at(-1)!.file_id;
    } else {
      const msg = await ctx.replyWithAudio(result.url);
      return msg.audio.file_id;
    }
  };

  const tryProxy = async () => {
    const file = await proxyToInputFile(result);
    if (result.mediaType === 'video') {
      const msg = await ctx.replyWithVideo(file);
      return msg.video.file_id;
    } else if (result.mediaType === 'photo') {
      const msg = await ctx.replyWithPhoto(file);
      return msg.photo.at(-1)!.file_id;
    } else {
      const msg = await ctx.replyWithAudio(file);
      return msg.audio.file_id;
    }
  };

  try {
    return await tryUrl();
  } catch (urlErr) {
    console.warn('[media] direct URL failed, proxying:', urlErr);
    return await tryProxy();
  }
}

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

    // Serve from cache when available
    const cached = await getCached(db, text);
    if (cached) {
      console.log('[media] cache hit:', text.slice(0, 60));
      if (cached.mediaType === 'video') await ctx.replyWithVideo(cached.fileId);
      else if (cached.mediaType === 'photo') await ctx.replyWithPhoto(cached.fileId);
      else await ctx.replyWithAudio(cached.fileId);
      return;
    }

    const statusMsg = await ctx.reply(t(lang, 'downloading'));
    let sentFileId: string | null = null;

    try {
      const result = await downloader(text);

      if (result.kind === 'local') {
        // VPS path — upload file from disk
        let fileId: string;
        if (result.mediaType === 'video') {
          const { rmSync } = await import('node:fs');
          const msg = await ctx.replyWithVideo(new InputFile(result.filePath));
          fileId = msg.video.file_id;
          try { rmSync(result.sessionDir, { recursive: true, force: true }); } catch { /* ok */ }
        } else if (result.mediaType === 'photo') {
          const msg = await ctx.replyWithPhoto(new InputFile(result.filePath));
          fileId = msg.photo.at(-1)!.file_id;
        } else {
          const msg = await ctx.replyWithAudio(new InputFile(result.filePath));
          fileId = msg.audio.file_id;
        }
        sentFileId = fileId;
      } else {
        // Workers path — URL or proxied blob
        sentFileId = await sendRemote(ctx, result);
      }

      if (sentFileId) {
        await setCache(db, text, sentFileId, result.mediaType);
      }
    } catch (err) {
      console.error('[media] error:', err);
      const key =
        err instanceof DownloadError
          ? err.kind === 'unsupported' ? 'unsupported'
          : err.kind === 'too_large' ? 'tooLarge'
          : 'error'
          : 'error';
      await ctx.reply(t(lang, key));
    } finally {
      try { await ctx.api.deleteMessage(chatId, statusMsg.message_id); } catch { /* ok */ }
    }
  });
}
