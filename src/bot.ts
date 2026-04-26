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

  bot.api.setMyCommands([
    { command: 'start', description: 'Start the bot' },
    { command: 'language', description: 'Change language' },
    { command: 'about', description: 'About this bot' },
    { command: 'admin', description: 'Admin panel' },
  ]);

  registerStartHandlers(bot, db, adminIds);
  registerAdminHandlers(bot, db, adminIds);
  // Media handler last — catches all text messages that aren't commands
  registerMediaHandlers(bot, db, downloader);

  bot.catch((err) => {
    console.error('[bot error]', err.message);
  });

  return bot;
}
