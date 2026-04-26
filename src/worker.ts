/// <reference types="@cloudflare/workers-types" />
/**
 * Cloudflare Workers entry point.
 * Bindings required in wrangler.toml:
 *   [vars] BOT_TOKEN, WEBHOOK_URL, ADMIN_IDS
 *   [[d1_databases]] binding = "DB"
 */
import { webhookCallback } from 'grammy';
import { D1Adapter } from './db/d1.ts';
import { createBot } from './bot.ts';

interface Env {
  BOT_TOKEN: string;
  ADMIN_IDS: string;
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const adminIds = new Set<number>(
      (env.ADMIN_IDS ?? '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter(Boolean),
    );

    const db = new D1Adapter(env.DB);
    await db.init();

    const bot = createBot(env.BOT_TOKEN, db, adminIds);
    const handler = webhookCallback(bot, 'cloudflare-mod');
    return handler(request);
  },
};
