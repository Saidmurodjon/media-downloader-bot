import { Hono } from 'hono';
import { webhookCallback } from 'grammy';
import { SqliteAdapter } from './db/sqlite.ts';
import { createBot } from './bot.ts';
import { download, cleanupTempDir } from './services/downloader.ts';

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) throw new Error('BOT_TOKEN is required');

const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = Number(process.env.PORT ?? 3000);
const DB_PATH = process.env.DB_PATH ?? './data.db';

const adminIds = new Set<number>(
  (process.env.ADMIN_IDS ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter(Boolean),
);

const db = new SqliteAdapter(DB_PATH);
await db.init();

const bot = createBot(TOKEN, db, adminIds, download);

cleanupTempDir();

if (WEBHOOK_URL) {
  await bot.api.setWebhook(WEBHOOK_URL);
  const app = new Hono();
  app.post('/', webhookCallback(bot, 'hono'));
  app.get('/', (c) => c.text('Media Downloader Bot is running.'));
  console.log(`Webhook server on port ${PORT}`);
  Bun.serve({ fetch: app.fetch, port: PORT });
} else {
  console.log('Starting in long-polling mode...');
  await bot.start();
}
