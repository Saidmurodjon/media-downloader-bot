import { readFileSync, mkdirSync } from 'fs';
import path from 'path';
import { Database } from 'bun:sqlite';

const dbPath = process.env['DB_PATH'] ?? './data/bot.db';
const schemaPath = path.join(import.meta.dir, '../src/schema.sql');

console.log(`[init-db] Using database: ${dbPath}`);
console.log(`[init-db] Schema: ${schemaPath}`);

mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath, { create: true });
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA foreign_keys = ON');

const schema = readFileSync(schemaPath, 'utf-8');
const statements = schema
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

let executed = 0;
for (const stmt of statements) {
  try {
    db.run(stmt);
    executed++;
  } catch (err) {
    console.error(`[init-db] Failed to execute statement:\n${stmt}\n${(err as Error).message}`);
  }
}

console.log(`[init-db] ✅ Executed ${executed}/${statements.length} statements`);

// Seed admin user if ADMIN_IDS is set
const adminIdsRaw = process.env['ADMIN_IDS'] ?? '';
const adminIds = adminIdsRaw
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map(Number)
  .filter((n) => !Number.isNaN(n));

if (adminIds.length > 0) {
  for (const adminId of adminIds) {
    db.run(
      `INSERT INTO users (telegram_id, username, first_name, language)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(telegram_id) DO NOTHING`,
      [adminId, 'admin', 'Admin', 'uz'],
    );
    console.log(`[init-db] Seeded admin user: ${adminId}`);
  }
}

db.close();
console.log('[init-db] Done.');
