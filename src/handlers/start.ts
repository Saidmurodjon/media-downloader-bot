import type { Bot, Context, InlineKeyboard } from 'grammy';
import { InlineKeyboard as IK } from 'grammy';
import { getDb } from '../db.js';
import { t } from '../i18n.js';

function langKeyboard(): InlineKeyboard {
  return new IK()
    .text("🇺🇿 O'zbek", 'lang:uz')
    .text('🇷🇺 Русский', 'lang:ru')
    .text('🇬🇧 English', 'lang:en');
}

export function registerStartHandlers(bot: Bot<Context>): void {
  bot.command('start', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const db = getDb();
    await db.upsertUser({
      telegramId: from.id,
      username: from.username,
      firstName: from.first_name,
    });

    const user = await db.getUser(from.id);
    const lang = user?.language ?? 'uz';
    const name = from.first_name ?? from.username ?? 'User';

    await ctx.reply(t(lang, 'welcome', { name }), {
      reply_markup: langKeyboard(),
      parse_mode: 'Markdown',
    });
  });

  bot.command('language', async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const db = getDb();
    const user = await db.getUser(from.id);
    const lang = user?.language ?? 'uz';

    await ctx.reply(t(lang, 'choose_language'), {
      reply_markup: langKeyboard(),
    });
  });

  bot.callbackQuery(/^lang:(uz|en|ru)$/, async (ctx) => {
    const from = ctx.from;
    const match = ctx.match;
    if (!from || !match) return;

    const lang = match[1] as 'uz' | 'en' | 'ru';
    const db = getDb();

    await db.upsertUser({
      telegramId: from.id,
      username: from.username,
      firstName: from.first_name,
      language: lang,
    });
    await db.updateUserLanguage(from.id, lang);

    await ctx.editMessageText(t(lang, 'language_saved'), {
      parse_mode: 'Markdown',
    });
    await ctx.answerCallbackQuery();
    await ctx.reply(t(lang, 'send_url_prompt'));
  });
}
