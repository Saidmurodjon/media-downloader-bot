import { Bot } from 'grammy';
import { registerStartHandlers } from './handlers/start.js';
import { registerMediaHandlers } from './handlers/media.js';
import { registerAdminHandlers } from './handlers/admin.js';
import { getDb } from './db.js';
import { t } from './i18n.js';

const token = process.env['BOT_TOKEN'];
if (!token) throw new Error('BOT_TOKEN is not set');

export const bot = new Bot(token);

// ─── Global error handler ─────────────────────────────────────────────────────

bot.catch((err) => {
  const ctx = err.ctx;
  const from = ctx.from;
  console.error(
    `[bot] Error for user ${from?.id ?? '?'} at ${new Date().toISOString()}: ${err.error}`,
  );
});

// ─── User upsert middleware ───────────────────────────────────────────────────

bot.use(async (ctx, next) => {
  const from = ctx.from;
  if (from && !ctx.callbackQuery) {
    const db = getDb();
    db.upsertUser({
      telegramId: from.id,
      username: from.username,
      firstName: from.first_name,
    });
  }
  return next();
});

// ─── Blocked-user guard middleware ────────────────────────────────────────────

bot.use(async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();

  const db = getDb();
  const user = db.getUser(from.id);
  if (user?.is_blocked) {
    const lang = user.language;
    if (ctx.message) {
      await ctx.reply(t(lang, 'user_blocked'));
    }
    return;
  }
  return next();
});

// ─── Register feature handlers ────────────────────────────────────────────────

registerStartHandlers(bot);
registerAdminHandlers(bot);
registerMediaHandlers(bot);

export default bot;
