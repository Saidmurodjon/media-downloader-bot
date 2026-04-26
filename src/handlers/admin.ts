import type { Bot, Context } from 'grammy';
import type { DbAdapter } from '../types.ts';
import { t } from '../i18n/index.ts';
import type { Language } from '../types.ts';

// Simple in-memory state for broadcast flow (per chatId)
const broadcastPending = new Set<number>();

const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function registerAdminHandlers(bot: Bot<Context>, db: DbAdapter, adminIds: Set<number>): void {
  function isAdmin(chatId: number): boolean {
    return adminIds.has(chatId);
  }

  bot.command('admin', async (ctx) => {
    const chatId = ctx.chat.id;
    const lang = ((await db.getUser(chatId))?.language ?? 'en') as Language;

    if (!isAdmin(chatId)) {
      await ctx.reply(t(lang, 'notAdmin'));
      return;
    }

    await ctx.reply(t(lang, 'adminPanel'), {
      reply_markup: {
        inline_keyboard: [
          [
            { text: t(lang, 'stats'), callback_data: 'admin:stats' },
            { text: t(lang, 'broadcast'), callback_data: 'admin:broadcast' },
          ],
        ],
      },
    });
  });

  bot.callbackQuery('admin:stats', async (ctx) => {
    const chatId = ctx.from.id;
    const lang = ((await db.getUser(chatId))?.language ?? 'en') as Language;

    if (!isAdmin(chatId)) {
      await ctx.answerCallbackQuery(t(lang, 'notAdmin'));
      return;
    }

    const count = await db.getUserCount();
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`${t(lang, 'totalUsers')}: ${count}`);
  });

  bot.callbackQuery('admin:broadcast', async (ctx) => {
    const chatId = ctx.from.id;
    const lang = ((await db.getUser(chatId))?.language ?? 'en') as Language;

    if (!isAdmin(chatId)) {
      await ctx.answerCallbackQuery(t(lang, 'notAdmin'));
      return;
    }

    broadcastPending.add(chatId);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(t(lang, 'broadcastPrompt'));
  });

  // Capture next message from admin as broadcast content
  bot.on('message', async (ctx, next) => {
    const chatId = ctx.chat.id;
    if (!broadcastPending.has(chatId)) return next();
    broadcastPending.delete(chatId);

    const lang = ((await db.getUser(chatId))?.language ?? 'en') as Language;
    const users = await db.getAllUsers();

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (u) => {
          try {
            await ctx.api.copyMessage(u.chatId, chatId, ctx.message.message_id);
            sent++;
          } catch {
            failed++;
          }
        }),
      );
      if (i + BATCH_SIZE < users.length) await sleep(BATCH_DELAY_MS);
    }

    await ctx.reply(`${t(lang, 'broadcastDone')} ${sent}\n${t(lang, 'broadcastFailed')} ${failed}`);
  });
}
