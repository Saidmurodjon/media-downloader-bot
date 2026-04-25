import { Hono } from 'hono';
import { webhookCallback } from 'grammy';
import { bot } from './bot.js';
import { getDb } from './db.js';
import { cleanupStaleTmpDirs, getTmpDir } from './utils/cleanup.js';
import { readFileSync, mkdirSync } from 'fs';
import path from 'path';

// ─── DB init ──────────────────────────────────────────────────────────────────

function initDb(): void {
  const dbDir = path.dirname(process.env['DB_PATH'] ?? './data/bot.db');
  mkdirSync(dbDir, { recursive: true });

  const schemaPath = new URL('./schema.sql', import.meta.url).pathname;
  const schema = readFileSync(schemaPath, 'utf-8');
  getDb().runSchema(schema);
}

// ─── Startup tasks ────────────────────────────────────────────────────────────

async function startup(): Promise<void> {
  initDb();

  const tmpDir = getTmpDir();
  mkdirSync(tmpDir, { recursive: true });
  await cleanupStaleTmpDirs(tmpDir);

  const webhookUrl = process.env['WEBHOOK_URL'];
  if (webhookUrl) {
    await bot.api.setWebhook(`${webhookUrl}/webhook`);
    console.log(`[bot] Webhook set to ${webhookUrl}/webhook`);
  } else {
    console.warn('[bot] WEBHOOK_URL not set — webhook not registered');
  }
}

// ─── Hono app ─────────────────────────────────────────────────────────────────

const app = new Hono();

app.post('/webhook', webhookCallback(bot, 'hono'));

app.get('/health', (c) =>
  c.json({ ok: true, ts: Date.now() }),
);

app.get('/', (c) => c.text('Media Downloader Bot is running.'));

// ─── Boot ─────────────────────────────────────────────────────────────────────

const PORT = Number(process.env['PORT'] ?? 3000);

startup()
  .then(() => {
    console.log(`[server] Listening on port ${PORT}`);
  })
  .catch((err) => {
    console.error('[server] Startup error:', err);
    process.exit(1);
  });

export default {
  port: PORT,
  fetch: app.fetch,
};
