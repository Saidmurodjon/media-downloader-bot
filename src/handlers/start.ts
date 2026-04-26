import type { Bot, Context } from 'grammy';
import type { DbAdapter } from '../types.ts';
import { t, languageButtons } from '../i18n/index.ts';
import type { Language } from '../types.ts';

export function registerStartHandlers(bot: Bot<Context>, db: DbAdapter, adminIds: Set<number>): void {
  bot.command('start', async (ctx) => {
    const chatId = ctx.chat.id;
    let user = await db.getUser(chatId);

    if (!user) {
      const isAdmin = adminIds.has(chatId) ? 1 : 0;
      await db.createUser({
        chatId,
        username: ctx.from?.username ?? null,
        firstName: ctx.from?.first_name ?? 'User',
        language: 'en',
        isAdmin,
      });
      user = await db.getUser(chatId);
    }

    const lang = (user?.language ?? 'en') as Language;

    await ctx.reply(t(lang, 'chooseLanguage'), {
      reply_markup: {
        inline_keyboard: [languageButtons],
      },
    });
  });

  bot.command('about', async (ctx) => {
    const user = await db.getUser(ctx.chat.id);
    const lang = (user?.language ?? 'en') as Language;
    await ctx.reply(t(lang, 'about'));
  });

  bot.command('language', async (ctx) => {
    const user = await db.getUser(ctx.chat.id);
    const lang = (user?.language ?? 'en') as Language;
    await ctx.reply(t(lang, 'chooseLanguage'), {
      reply_markup: {
        inline_keyboard: [languageButtons],
      },
    });
  });

  bot.callbackQuery(/^lang:(uz|ru|en)$/, async (ctx) => {
    const lang = ctx.match[1] as Language;
    const chatId = ctx.chat?.id ?? ctx.from.id;

    let user = await db.getUser(chatId);
    if (!user) {
      const isAdmin = adminIds.has(chatId) ? 1 : 0;
      await db.createUser({
        chatId,
        username: ctx.from.username ?? null,
        firstName: ctx.from.first_name ?? 'User',
        language: lang,
        isAdmin,
      });
    } else {
      await db.updateUser(chatId, { language: lang });
    }

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(t(lang, 'languageSet'));
  });
}
