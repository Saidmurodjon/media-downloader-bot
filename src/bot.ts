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
  console.error(
    `[bot] Error for user ${ctx.from?.id ?? '?'} at ${new Date().toISOString()}: ${err.error}`,
  );
});

// ─── User upsert middleware ───────────────────────────────────────────────────

bot.use(async (ctx, next) => {
  const from = ctx.from;
  if (from && !ctx.callbackQuery) {
    await getDb().upsertUser({
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

  const user = await getDb().getUser(from.id);
  if (user?.is_blocked) {
    if (ctx.message) await ctx.reply(t(user.language, 'user_blocked'));
    return;
  }
  return next();
});

// ─── Feature handlers ─────────────────────────────────────────────────────────

registerStartHandlers(bot);
registerAdminHandlers(bot);
registerMediaHandlers(bot);

export default bot;
