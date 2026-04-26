import { readFileSync, mkdirSync } from 'fs';
import path from 'path';
import { createSQLiteAdapter } from '../src/db.sqlite.js';

const dbPath = process.env['DB_PATH'] ?? './data/bot.db';
const schemaPath = path.join(import.meta.dir, '../src/schema.sql');

console.log(`[init-db] Using database: ${dbPath}`);
console.log(`[init-db] Schema: ${schemaPath}`);

mkdirSync(path.dirname(dbPath), { recursive: true });

const db = createSQLiteAdapter(dbPath);
const schema = readFileSync(schemaPath, 'utf-8');
await db.runSchema(schema);
console.log('[init-db] ✅ Schema applied');

// Seed admin users
const adminIdsRaw = process.env['ADMIN_IDS'] ?? '';
const adminIds = adminIdsRaw
  .split(',').map((s) => s.trim()).filter(Boolean)
  .map(Number).filter((n) => !Number.isNaN(n));

for (const adminId of adminIds) {
  await db.upsertUser({ telegramId: adminId, username: 'admin', firstName: 'Admin', language: 'uz' });
  console.log(`[init-db] Seeded admin: ${adminId}`);
}

console.log('[init-db] Done.');
