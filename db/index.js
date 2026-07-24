const { Pool } = require("pg");
const { DATABASE_URL } = require("../config");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      chat_id BIGINT PRIMARY KEY,
      username TEXT,
      language TEXT NOT NULL DEFAULT '',
      step INTEGER NOT NULL DEFAULT 0,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;`);

  // video_cache used to be keyed by url alone; now a url can be cached once
  // per format (video/audio), so it needs a composite key. This is a pure
  // cache table (nothing of value is lost), so on the old single-column-PK
  // shape we just recreate it instead of hand-rolling a constraint migration.
  const { rows: formatColumn } = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'video_cache' AND column_name = 'format'
  `);
  if (formatColumn.length === 0) {
    await pool.query(`DROP TABLE IF EXISTS video_cache;`);
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS video_cache (
      url TEXT NOT NULL,
      format TEXT NOT NULL DEFAULT 'video',
      platform TEXT NOT NULL,
      file_id TEXT NOT NULL,
      title TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (url, format)
    );
  `);
  await pool.query(`ALTER TABLE video_cache ADD COLUMN IF NOT EXISTS title TEXT;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS downloads (
      id SERIAL PRIMARY KEY,
      chat_id BIGINT NOT NULL,
      platform TEXT NOT NULL,
      cached BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS channels (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      target_count INTEGER,
      target_notified BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS channel_events (
      id SERIAL PRIMARY KEY,
      channel_username TEXT NOT NULL,
      chat_id BIGINT NOT NULL,
      event TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

module.exports = { pool, initSchema };
