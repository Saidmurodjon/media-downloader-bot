import { Bot } from 'grammy';
import type { DbAdapter } from './types.ts';
import { registerStartHandlers } from './handlers/start.ts';
import { registerMediaHandlers } from './handlers/media.ts';
import { registerAdminHandlers } from './handlers/admin.ts';

export function createBot(token: string, db: DbAdapter, adminIds: Set<number>): Bot {
  const bot = new Bot(token);

  bot.api.setMyCommands([
    { command: 'start', description: 'Start the bot' },
    { command: 'language', description: 'Change language' },
    { command: 'about', description: 'About this bot' },
    { command: 'admin', description: 'Admin panel' },
  ]);

  registerStartHandlers(bot, db, adminIds);
  registerAdminHandlers(bot, db, adminIds);
  // Media handler must come last (catches all text messages)
  registerMediaHandlers(bot, db);

  bot.catch((err) => {
    console.error('Bot error:', err.message);
  });

  return bot;
}
