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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Media Downloader Bot is running.', { status: 200 });
    }

    const adminIds = new Set<number>(
      (env.ADMIN_IDS ?? '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter(Boolean),
    );

    const db = new D1Adapter(env.DB);
    await db.init();

    const bot = createBot(env.BOT_TOKEN, db, adminIds, downloadViaApi);
    const handler = webhookCallback(bot, 'cloudflare-mod');
    return handler(request);
  },
};
