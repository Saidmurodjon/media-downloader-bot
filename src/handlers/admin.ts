import type { Bot, Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { getDb } from '../db.js';
import { t } from '../i18n.js';
import type { DbStats, DbMediaCache, DbUser } from '../db.js';

// ─── Admin guard ──────────────────────────────────────────────────────────────

function getAdminIds(): Set<number> {
  const raw = process.env['ADMIN_IDS'] ?? '';
  return new Set(
    raw.split(',').map((s) => s.trim()).filter(Boolean)
      .map(Number).filter((n) => !Number.isNaN(n)),
  );
}

function isAdmin(userId: number): boolean {
  return getAdminIds().has(userId);
}

// ─── Broadcast session state ──────────────────────────────────────────────────

type BroadcastStep =
  | 'choose_type' | 'choose_target' | 'enter_user_id'
  | 'enter_text'  | 'enter_forward' | 'confirm';

interface BroadcastSession {
  step: BroadcastStep;
  type?: 'text' | 'forward';
  target?: 'all' | 'user';
  targetUserId?: number;
  text?: string;
  forwardMessageId?: number;
  forwardChatId?: number;
}

const broadcastSessions = new Map<number, BroadcastSession>();

// ─── Keyboards ────────────────────────────────────────────────────────────────

const adminPanelKeyboard = () =>
  new InlineKeyboard()
    .text('📊 Statistika', 'admin:stats').text('📨 Broadcast', 'admin:broadcast').row()
    .text('👥 Foydalanuvchilar', 'admin:users').text('🗄️ Cache', 'admin:cache');

const broadcastTypeKeyboard = () =>
  new InlineKeyboard().text('✏️ Matn', 'bc:type:text').text('↪️ Forward', 'bc:type:forward');

const broadcastTargetKeyboard = () =>
  new InlineKeyboard().text('🌐 Hammaga', 'bc:target:all').text('👤 Bitta userga', 'bc:target:user');

const broadcastConfirmKeyboard = () =>
  new InlineKeyboard().text('✅ Yuborish', 'bc:send').text('❌ Bekor qilish', 'bc:cancel');

// ─── Stats formatter ──────────────────────────────────────────────────────────

async function formatStats(lang: string): Promise<string> {
  const db = getDb();
  const [stats, top]: [DbStats, DbMediaCache[]] = await Promise.all([
    db.getStats(),
    db.getTopUrls(5),
  ]);

  const cachePercent =
    stats.totalRequests > 0
      ? ((stats.cacheHits / stats.totalRequests) * 100).toFixed(1)
      : '0.0';

  const topUrls = top
    .map((m, i) => `${i + 1}. ${m.original_url} — ${m.request_count} ta`)
    .join('\n');

  return t(lang, 'admin_stats', {
    totalUsers:     stats.totalUsers.toLocaleString(),
    totalRequests:  stats.totalRequests.toLocaleString(),
    cacheHits:      stats.cacheHits.toLocaleString(),
    cachePercent,
    youtubeCount:   stats.youtubeCount.toLocaleString(),
    instagramCount: stats.instagramCount.toLocaleString(),
    todayRequests:  stats.todayRequests.toLocaleString(),
    topUrls:        topUrls || '—',
  });
}

// ─── Helper: resolve admin language ──────────────────────────────────────────

async function adminLang(userId: number): Promise<string> {
  const user = await getDb().getUser(userId);
  return user?.language ?? 'uz';
}

// ─── Broadcast sender ─────────────────────────────────────────────────────────

const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 1000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function runBroadcast(
  ctx: Context,
  session: BroadcastSession,
  lang: string,
): Promise<void> {
  const db = getDb();
  const allUsers = await db.getAllUsers();

  const targets: DbUser[] =
    session.target === 'all'
      ? allUsers
      : allUsers.filter((u) => u.telegram_id === session.targetUserId);

  const statusMsg = await ctx.reply(t(lang, 'broadcast_sending'));
  let sent = 0;

  const broadcastId = await db.saveBroadcast({
    adminId: ctx.from!.id,
    messageText: session.text,
    telegramMessageId: session.forwardMessageId,
    target: session.target === 'user' ? String(session.targetUserId) : 'all',
  });

  for (let i = 0; i < targets.length; i++) {
    const user = targets[i]!;
    try {
      if (session.type === 'text' && session.text) {
        await ctx.api.sendMessage(user.telegram_id, session.text, { parse_mode: 'Markdown' });
        sent++;
      } else if (session.type === 'forward' && session.forwardMessageId && session.forwardChatId) {
        await ctx.api.forwardMessage(user.telegram_id, session.forwardChatId, session.forwardMessageId);
        sent++;
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (!msg.includes('blocked') && !msg.includes('deactivated') && !msg.includes('not found')) {
        console.error(`[broadcast] Failed user ${user.telegram_id}: ${msg}`);
      }
    }
    if ((i + 1) % BATCH_SIZE === 0) await sleep(BATCH_DELAY_MS);
  }

  await db.updateBroadcastSentCount(broadcastId, sent);
  await ctx.api.editMessageText(
    statusMsg.chat.id, statusMsg.message_id,
    t(lang, 'admin_sent', { count: String(sent) }),
  );
}

// ─── Register handlers ────────────────────────────────────────────────────────

export function registerAdminHandlers(bot: Bot<Context>): void {

  // /admin
  bot.command('admin', async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    if (!isAdmin(from.id)) { await ctx.reply(t(await adminLang(from.id), 'admin_only')); return; }
    const lang = await adminLang(from.id);
    await ctx.reply(t(lang, 'admin_panel'), { reply_markup: adminPanelKeyboard(), parse_mode: 'Markdown' });
  });

  // /stats
  bot.command('stats', async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    if (!isAdmin(from.id)) { await ctx.reply(t(await adminLang(from.id), 'admin_only')); return; }
    await ctx.reply(await formatStats(await adminLang(from.id)), { parse_mode: 'Markdown' });
  });

  // /userinfo <id>
  bot.command('userinfo', async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    if (!isAdmin(from.id)) { await ctx.reply(t(await adminLang(from.id), 'admin_only')); return; }
    const lang = await adminLang(from.id);
    const db = getDb();

    const args = ctx.message?.text?.split(' ').slice(1) ?? [];
    if (!args[0]) { await ctx.reply(t(lang, 'missing_user_id')); return; }
    const targetId = Number(args[0]);
    if (Number.isNaN(targetId)) { await ctx.reply(t(lang, 'invalid_user_id')); return; }

    const target = await db.getUser(targetId);
    if (!target) { await ctx.reply(t(lang, 'user_not_found')); return; }

    await ctx.reply(
      t(lang, 'user_info', {
        telegramId: String(target.telegram_id),
        firstName:  target.first_name ?? '—',
        username:   target.username ?? '—',
        language:   target.language,
        createdAt:  target.created_at,
        lastActive: target.last_active,
        isBlocked:  target.is_blocked ? '✅ Ha' : "❌ Yo'q",
      }),
      { parse_mode: 'Markdown' },
    );
  });

  // /broadcast
  bot.command('broadcast', async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    if (!isAdmin(from.id)) { await ctx.reply(t(await adminLang(from.id), 'admin_only')); return; }
    const lang = await adminLang(from.id);
    broadcastSessions.set(from.id, { step: 'choose_type' });
    await ctx.reply(t(lang, 'admin_broadcast_prompt'), { reply_markup: broadcastTypeKeyboard() });
  });

  // ── Admin panel callbacks ─────────────────────────────────────────────────

  bot.callbackQuery('admin:stats', async (ctx) => {
    const from = ctx.from;
    if (!from || !isAdmin(from.id)) { await ctx.answerCallbackQuery('⛔'); return; }
    await ctx.editMessageText(await formatStats(await adminLang(from.id)), { parse_mode: 'Markdown' });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('admin:broadcast', async (ctx) => {
    const from = ctx.from;
    if (!from || !isAdmin(from.id)) { await ctx.answerCallbackQuery('⛔'); return; }
    const lang = await adminLang(from.id);
    broadcastSessions.set(from.id, { step: 'choose_type' });
    await ctx.editMessageText(t(lang, 'admin_broadcast_prompt'), { reply_markup: broadcastTypeKeyboard() });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('admin:users', async (ctx) => {
    const from = ctx.from;
    if (!from || !isAdmin(from.id)) { await ctx.answerCallbackQuery('⛔'); return; }
    const users = await getDb().getAllUsers();
    await ctx.editMessageText(`👥 *Foydalanuvchilar*\n\nJami: *${users.length}*`, { parse_mode: 'Markdown' });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('admin:cache', async (ctx) => {
    const from = ctx.from;
    if (!from || !isAdmin(from.id)) { await ctx.answerCallbackQuery('⛔'); return; }
    const lang = await adminLang(from.id);
    const stats = await getDb().getCacheStats();
    await ctx.editMessageText(
      t(lang, 'cache_stats', { total: String(stats.total), size: String(stats.totalRequests) }),
      { parse_mode: 'Markdown' },
    );
    await ctx.answerCallbackQuery();
  });

  // ── Broadcast type ────────────────────────────────────────────────────────

  bot.callbackQuery(/^bc:type:(text|forward)$/, async (ctx) => {
    const from = ctx.from;
    const match = ctx.match;
    if (!from || !isAdmin(from.id) || !match) { await ctx.answerCallbackQuery('⛔'); return; }
    const lang = await adminLang(from.id);
    const type = match[1] as 'text' | 'forward';
    const session = broadcastSessions.get(from.id) ?? { step: 'choose_type' as BroadcastStep };
    session.type = type;
    session.step = 'choose_target';
    broadcastSessions.set(from.id, session);
    await ctx.editMessageText(t(lang, 'broadcast_target'), { reply_markup: broadcastTargetKeyboard() });
    await ctx.answerCallbackQuery();
  });

  // ── Broadcast target ──────────────────────────────────────────────────────

  bot.callbackQuery(/^bc:target:(all|user)$/, async (ctx) => {
    const from = ctx.from;
    const match = ctx.match;
    if (!from || !isAdmin(from.id) || !match) { await ctx.answerCallbackQuery('⛔'); return; }
    const lang = await adminLang(from.id);
    const target = match[1] as 'all' | 'user';
    const session = broadcastSessions.get(from.id);
    if (!session) { await ctx.answerCallbackQuery(); return; }

    session.target = target;
    broadcastSessions.set(from.id, session);

    if (target === 'user') {
      session.step = 'enter_user_id';
      await ctx.editMessageText(t(lang, 'broadcast_enter_user_id'));
    } else {
      session.step = session.type === 'text' ? 'enter_text' : 'enter_forward';
      await ctx.editMessageText(
        session.type === 'text' ? t(lang, 'broadcast_enter_text') : t(lang, 'broadcast_forward_message'),
      );
    }
    await ctx.answerCallbackQuery();
  });

  // ── Broadcast confirm / cancel ────────────────────────────────────────────

  bot.callbackQuery('bc:send', async (ctx) => {
    const from = ctx.from;
    if (!from || !isAdmin(from.id)) { await ctx.answerCallbackQuery('⛔'); return; }
    const session = broadcastSessions.get(from.id);
    if (!session) { await ctx.answerCallbackQuery(); return; }
    const lang = await adminLang(from.id);
    broadcastSessions.delete(from.id);
    await ctx.editMessageText(t(lang, 'broadcast_sending'));
    await ctx.answerCallbackQuery();
    await runBroadcast(ctx, session, lang);
  });

  bot.callbackQuery('bc:cancel', async (ctx) => {
    const from = ctx.from;
    if (!from || !isAdmin(from.id)) { await ctx.answerCallbackQuery('⛔'); return; }
    const lang = await adminLang(from.id);
    broadcastSessions.delete(from.id);
    await ctx.editMessageText(t(lang, 'broadcast_cancelled'));
    await ctx.answerCallbackQuery();
  });

  // ── Text intercept for broadcast flow ────────────────────────────────────

  bot.on('message', async (ctx, next) => {
    const from = ctx.from;
    if (!from || !isAdmin(from.id)) return next();
    const session = broadcastSessions.get(from.id);
    if (!session) return next();

    const lang = await adminLang(from.id);
    const msg = ctx.message;

    if (session.step === 'enter_user_id') {
      const idStr = 'text' in msg ? msg.text : '';
      const targetId = Number(idStr);
      if (Number.isNaN(targetId)) { await ctx.reply(t(lang, 'invalid_user_id')); return; }
      session.targetUserId = targetId;
      session.step = session.type === 'text' ? 'enter_text' : 'enter_forward';
      broadcastSessions.set(from.id, session);
      await ctx.reply(
        session.type === 'text' ? t(lang, 'broadcast_enter_text') : t(lang, 'broadcast_forward_message'),
      );
      return;
    }

    if (session.step === 'enter_text') {
      const text = 'text' in msg ? msg.text : undefined;
      if (!text) return next();
      session.text = text;
      session.step = 'confirm';
      broadcastSessions.set(from.id, session);
      const targetLabel = session.target === 'all' ? '🌐 Hammaga' : `👤 User: ${session.targetUserId}`;
      await ctx.reply(
        t(lang, 'broadcast_confirm', { preview: text.slice(0, 200), target: targetLabel }),
        { reply_markup: broadcastConfirmKeyboard(), parse_mode: 'Markdown' },
      );
      return;
    }

    if (session.step === 'enter_forward') {
      const forwardOrigin = msg.forward_origin;
      if (!forwardOrigin) { await ctx.reply(t(lang, 'broadcast_forward_message')); return; }
      session.forwardMessageId = msg.message_id;
      session.forwardChatId = msg.chat.id;
      session.step = 'confirm';
      broadcastSessions.set(from.id, session);
      const targetLabel = session.target === 'all' ? '🌐 Hammaga' : `👤 User: ${session.targetUserId}`;
      await ctx.reply(
        t(lang, 'broadcast_confirm', { preview: '[Forward xabar]', target: targetLabel }),
        { reply_markup: broadcastConfirmKeyboard(), parse_mode: 'Markdown' },
      );
      return;
    }

    return next();
  });
}
