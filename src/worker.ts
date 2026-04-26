// Cloudflare Workers entry point.
// Replaces src/index.ts when deploying with `wrangler deploy`.
//
// Architecture:
//   - Webhook received by Worker → Grammy handles update
//   - D1 used for all DB operations (no bun:sqlite)
//   - Cache hits served directly (file_id forwarded to user)
//   - Cache misses forwarded to DOWNLOAD_SERVICE_URL (Bun VPS)

import { Hono } from 'hono';
import { Bot, webhookCallback } from 'grammy';
import { setDb, getDb, createD1Adapter } from './db.js';
import { registerStartHandlers } from './handlers/start.js';
import { registerAdminHandlers } from './handlers/admin.js';
import { registerWorkerMediaHandlers } from './handlers/media.worker.js';
import { t } from './i18n.js';

export interface WorkerEnv {
  DB: D1Database;
  BOT_TOKEN: string;
  ADMIN_IDS: string;
  WEBHOOK_URL: string;
  DOWNLOAD_SERVICE_URL?: string;
  MAX_FILE_SIZE_MB?: string;
}

// D1Database type is provided by @cloudflare/workers-types.
// Redeclared here so the file compiles under both tsconfig targets.
interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  exec(sql: string): Promise<{ count: number; duration: number }>;
  batch<T>(statements: D1PreparedStatement[]): Promise<{ results?: T[]; success: boolean; meta: Record<string, unknown> }[]>;
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(col?: string): Promise<T | null>;
  run(): Promise<{ success: boolean; meta: Record<string, unknown> }>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[]; success: boolean; meta: Record<string, unknown> }>;
}

// Bot instances are cached per token inside this isolate lifetime.
const botCache = new Map<string, Bot>();

function getBot(token: string, env: WorkerEnv): Bot {
  if (botCache.has(token)) return botCache.get(token)!;

  // Expose DOWNLOAD_SERVICE_URL globally so media.worker.ts can read it.
  (globalThis as Record<string, unknown>)['DOWNLOAD_SERVICE_URL'] = env.DOWNLOAD_SERVICE_URL;
  (globalThis as Record<string, unknown>)['ADMIN_IDS'] = env.ADMIN_IDS;

  const b = new Bot(token);

  b.catch((err) => {
    console.error(
      `[worker] Error user=${err.ctx.from?.id ?? '?'}: ${(err.error as Error).message}`,
    );
  });

  // Upsert + block-guard middleware
  b.use(async (ctx, next) => {
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

  b.use(async (ctx, next) => {
    const from = ctx.from;
    if (!from) return next();
    const user = await getDb().getUser(from.id);
    if (user?.is_blocked) {
      if (ctx.message) await ctx.reply(t(user.language, 'user_blocked'));
      return;
    }
    return next();
  });

  registerStartHandlers(b);
  registerAdminHandlers(b);
  registerWorkerMediaHandlers(b);

  botCache.set(token, b);
  return b;
}

// ─── Hono app ─────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: WorkerEnv }>();

app.use('*', async (c, next) => {
  // Init D1 adapter once per request (safe: same binding, no shared state).
  setDb(createD1Adapter(c.env.DB as unknown as import('./db.js').D1Database));
  // Expose env vars that handlers read via process.env fallback.
  process.env['ADMIN_IDS'] = c.env.ADMIN_IDS;
  process.env['DOWNLOAD_SERVICE_URL'] = c.env.DOWNLOAD_SERVICE_URL ?? '';
  return next();
});

app.post('/webhook', async (c) => {
  const bot = getBot(c.env.BOT_TOKEN, c.env);
  return webhookCallback(bot, 'hono')(c);
});

app.get('/health', (c) => c.json({ ok: true, ts: Date.now(), runtime: 'workers' }));

app.get('/', (c) => c.text('Media Downloader Bot (Cloudflare Workers)'));

export default app;
