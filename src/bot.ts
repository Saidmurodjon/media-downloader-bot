import { Bot } from 'grammy';
import type { DbAdapter, DownloaderFn } from './types.ts';
import { registerStartHandlers } from './handlers/start.ts';
import { registerMediaHandlers } from './handlers/media.ts';
import { registerAdminHandlers } from './handlers/admin.ts';

export function createBot(
  token: string,
  db: DbAdapter,
  adminIds: Set<number>,
  downloader: DownloaderFn,
): Bot {
  const bot = new Bot(token);

  registerStartHandlers(bot, db, adminIds);
  registerAdminHandlers(bot, db, adminIds);
  // Media handler last — catches all non-command text
  registerMediaHandlers(bot, db, downloader);

  bot.catch((err) => {
    console.error('[bot error]', err.message, err.error);
  });

  return bot;
}
