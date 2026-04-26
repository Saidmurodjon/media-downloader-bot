/// <reference types="@cloudflare/workers-types" />
import { webhookCallback } from 'grammy';
import { D1Adapter } from './db/d1.ts';
import { createBot } from './bot.ts';
import { downloadViaApi } from './services/downloader-api.ts';

interface Env {
  BOT_TOKEN: string;
  ADMIN_IDS: string;
  DB: D1Database;
}

// Module-level flag — persists across requests in the same Worker instance
let dbReady = false;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Health check
    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({ ok: true, bot: 'media-downloader-bot' }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    try {
      if (!env.BOT_TOKEN) {
        console.error('[worker] BOT_TOKEN secret is not set!');
        return new Response('BOT_TOKEN missing', { status: 500 });
      }

      const adminIds = new Set<number>(
        (env.ADMIN_IDS ?? '')
          .split(',')
          .map((s) => Number(s.trim()))
          .filter(Boolean),
      );

      const db = new D1Adapter(env.DB);

      // Init DB tables once per Worker instance lifetime
      if (!dbReady) {
        await db.init();
        dbReady = true;
      }

      const bot = createBot(env.BOT_TOKEN, db, adminIds, downloadViaApi);
      const handler = webhookCallback(bot, 'cloudflare-mod');
      return await handler(request);
    } catch (err) {
      console.error('[worker] Unhandled error:', err);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};
