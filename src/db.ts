import { readFileSync } from 'fs';
import { Database } from 'bun:sqlite';

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface DbUser {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  language: string;
  is_blocked: number;
  created_at: string;
  last_active: string;
}

export interface DbMediaCache {
  id: number;
  url_hash: string;
  original_url: string;
  platform: string;
  telegram_file_id: string;
  file_type: string;
  title: string | null;
  downloaded_at: string;
  request_count: number;
}

export interface DbRequest {
  id: number;
  user_id: number;
  url_hash: string;
  requested_at: string;
  was_cached: number;
}

export interface DbBroadcast {
  id: number;
  admin_id: number;
  message_text: string | null;
  telegram_message_id: number | null;
  target: string;
  sent_count: number;
  created_at: string;
}

export interface DbStats {
  totalUsers: number;
  totalRequests: number;
  cacheHits: number;
  youtubeCount: number;
  instagramCount: number;
  todayRequests: number;
}

// ─── Adapter interface ────────────────────────────────────────────────────────

export interface DbAdapter {
  // Users
  getUser(telegramId: number): DbUser | null;
  upsertUser(data: {
    telegramId: number;
    username?: string | null;
    firstName?: string | null;
    language?: string;
  }): void;
  updateUserLanguage(telegramId: number, language: string): void;
  updateUserActivity(telegramId: number): void;
  getAllUsers(): DbUser[];
  blockUser(telegramId: number, blocked: boolean): void;

  // Media cache
  getCachedMedia(urlHash: string): DbMediaCache | null;
  saveMediaCache(data: {
    urlHash: string;
    originalUrl: string;
    platform: string;
    telegramFileId: string;
    fileType: string;
    title?: string | null;
  }): void;
  incrementCacheCount(urlHash: string): void;
  getTopUrls(limit: number): DbMediaCache[];
  getCacheStats(): { total: number; totalRequests: number };

  // Requests
  logRequest(data: {
    userId: number;
    urlHash: string;
    wasCached: boolean;
  }): void;
  getStats(): DbStats;

  // Broadcasts
  saveBroadcast(data: {
    adminId: number;
    messageText?: string | null;
    telegramMessageId?: number | null;
    target: string;
  }): number;
  updateBroadcastSentCount(id: number, count: number): void;

  // Schema
  runSchema(sql: string): void;
}

// ─── SQLite (bun:sqlite) adapter ─────────────────────────────────────────────

export function createSQLiteAdapter(dbPath: string): DbAdapter {
  const db = new Database(dbPath, { create: true });
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA synchronous = NORMAL');

  return {
    runSchema(sql) {
      const statements = sql
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const stmt of statements) {
        db.run(stmt);
      }
    },

    getUser(telegramId) {
      return (
        (db
          .query('SELECT * FROM users WHERE telegram_id = ?')
          .get(telegramId) as DbUser | undefined) ?? null
      );
    },

    upsertUser({ telegramId, username, firstName, language = 'uz' }) {
      db.run(
        `INSERT INTO users (telegram_id, username, first_name, language)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(telegram_id) DO UPDATE SET
           username     = excluded.username,
           first_name   = excluded.first_name,
           last_active  = datetime('now')`,
        [telegramId, username ?? null, firstName ?? null, language],
      );
    },

    updateUserLanguage(telegramId, language) {
      db.run(
        "UPDATE users SET language = ?, last_active = datetime('now') WHERE telegram_id = ?",
        [language, telegramId],
      );
    },

    updateUserActivity(telegramId) {
      db.run(
        "UPDATE users SET last_active = datetime('now') WHERE telegram_id = ?",
        [telegramId],
      );
    },

    getAllUsers() {
      return db
        .query('SELECT * FROM users WHERE is_blocked = 0')
        .all() as DbUser[];
    },

    blockUser(telegramId, blocked) {
      db.run('UPDATE users SET is_blocked = ? WHERE telegram_id = ?', [
        blocked ? 1 : 0,
        telegramId,
      ]);
    },

    getCachedMedia(urlHash) {
      return (
        (db
          .query('SELECT * FROM media_cache WHERE url_hash = ?')
          .get(urlHash) as DbMediaCache | undefined) ?? null
      );
    },

    saveMediaCache({ urlHash, originalUrl, platform, telegramFileId, fileType, title }) {
      db.run(
        `INSERT INTO media_cache (url_hash, original_url, platform, telegram_file_id, file_type, title)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(url_hash) DO UPDATE SET
           telegram_file_id = excluded.telegram_file_id,
           request_count    = request_count + 1`,
        [urlHash, originalUrl, platform, telegramFileId, fileType, title ?? null],
      );
    },

    incrementCacheCount(urlHash) {
      db.run(
        'UPDATE media_cache SET request_count = request_count + 1 WHERE url_hash = ?',
        [urlHash],
      );
    },

    getTopUrls(limit) {
      return db
        .query(
          'SELECT * FROM media_cache ORDER BY request_count DESC LIMIT ?',
        )
        .all(limit) as DbMediaCache[];
    },

    getCacheStats() {
      const row = db
        .query(
          'SELECT COUNT(*) as total, SUM(request_count) as totalRequests FROM media_cache',
        )
        .get() as { total: number; totalRequests: number | null };
      return { total: row.total, totalRequests: row.totalRequests ?? 0 };
    },

    logRequest({ userId, urlHash, wasCached }) {
      db.run(
        'INSERT INTO requests (user_id, url_hash, was_cached) VALUES (?, ?, ?)',
        [userId, urlHash, wasCached ? 1 : 0],
      );
    },

    getStats() {
      const totalUsers = (
        db.query('SELECT COUNT(*) as n FROM users').get() as { n: number }
      ).n;

      const totalRequests = (
        db.query('SELECT COUNT(*) as n FROM requests').get() as { n: number }
      ).n;

      const cacheHits = (
        db
          .query('SELECT COUNT(*) as n FROM requests WHERE was_cached = 1')
          .get() as { n: number }
      ).n;

      const ytRow = db
        .query(
          "SELECT COUNT(*) as n FROM media_cache WHERE platform = 'youtube'",
        )
        .get() as { n: number };

      const igRow = db
        .query(
          "SELECT COUNT(*) as n FROM media_cache WHERE platform = 'instagram'",
        )
        .get() as { n: number };

      const todayRequests = (
        db
          .query(
            "SELECT COUNT(*) as n FROM requests WHERE date(requested_at) = date('now')",
          )
          .get() as { n: number }
      ).n;

      return {
        totalUsers,
        totalRequests,
        cacheHits,
        youtubeCount: ytRow.n,
        instagramCount: igRow.n,
        todayRequests,
      };
    },

    saveBroadcast({ adminId, messageText, telegramMessageId, target }) {
      db.run(
        `INSERT INTO broadcasts (admin_id, message_text, telegram_message_id, target)
         VALUES (?, ?, ?, ?)`,
        [adminId, messageText ?? null, telegramMessageId ?? null, target],
      );
      return (
        db
          .query('SELECT last_insert_rowid() as id')
          .get() as { id: number }
      ).id;
    },

    updateBroadcastSentCount(id, count) {
      db.run('UPDATE broadcasts SET sent_count = ? WHERE id = ?', [count, id]);
    },
  };
}

// ─── D1 adapter (Cloudflare Workers) ─────────────────────────────────────────

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  exec(sql: string): Promise<{ count: number; duration: number }>;
  batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(col?: string): Promise<T | null>;
  run(): Promise<D1Result>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Result<T = Record<string, unknown>> {
  results?: T[];
  success: boolean;
  meta: Record<string, unknown>;
}

export function createD1Adapter(d1: D1Database): DbAdapter {
  async function run(sql: string, params: unknown[] = []) {
    await d1.prepare(sql).bind(...params).run();
  }

  async function get<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    return d1.prepare(sql).bind(...params).first<T>();
  }

  async function all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await d1.prepare(sql).bind(...params).all<T>();
    return result.results ?? [];
  }

  // D1 adapter returns promises — the interface methods are synchronous for
  // SQLite compat. In a Workers environment, callers must await them.
  // Cast here so the interface is satisfied; Workers handlers are all async.
  return {
    runSchema(sql) {
      const statements = sql.split(';').map((s) => s.trim()).filter(Boolean);
      void Promise.all(statements.map((s) => d1.prepare(s).run()));
    },

    getUser: (telegramId) =>
      get<DbUser>('SELECT * FROM users WHERE telegram_id = ?', [telegramId]) as unknown as DbUser | null,

    upsertUser: ({ telegramId, username, firstName, language = 'uz' }) =>
      void run(
        `INSERT INTO users (telegram_id, username, first_name, language)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(telegram_id) DO UPDATE SET
           username    = excluded.username,
           first_name  = excluded.first_name,
           last_active = datetime('now')`,
        [telegramId, username ?? null, firstName ?? null, language],
      ),

    updateUserLanguage: (telegramId, language) =>
      void run(
        "UPDATE users SET language = ?, last_active = datetime('now') WHERE telegram_id = ?",
        [language, telegramId],
      ),

    updateUserActivity: (telegramId) =>
      void run(
        "UPDATE users SET last_active = datetime('now') WHERE telegram_id = ?",
        [telegramId],
      ),

    getAllUsers: () =>
      all<DbUser>('SELECT * FROM users WHERE is_blocked = 0') as unknown as DbUser[],

    blockUser: (telegramId, blocked) =>
      void run('UPDATE users SET is_blocked = ? WHERE telegram_id = ?', [
        blocked ? 1 : 0,
        telegramId,
      ]),

    getCachedMedia: (urlHash) =>
      get<DbMediaCache>('SELECT * FROM media_cache WHERE url_hash = ?', [
        urlHash,
      ]) as unknown as DbMediaCache | null,

    saveMediaCache: ({ urlHash, originalUrl, platform, telegramFileId, fileType, title }) =>
      void run(
        `INSERT INTO media_cache (url_hash, original_url, platform, telegram_file_id, file_type, title)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(url_hash) DO UPDATE SET
           telegram_file_id = excluded.telegram_file_id,
           request_count    = request_count + 1`,
        [urlHash, originalUrl, platform, telegramFileId, fileType, title ?? null],
      ),

    incrementCacheCount: (urlHash) =>
      void run(
        'UPDATE media_cache SET request_count = request_count + 1 WHERE url_hash = ?',
        [urlHash],
      ),

    getTopUrls: (limit) =>
      all<DbMediaCache>(
        'SELECT * FROM media_cache ORDER BY request_count DESC LIMIT ?',
        [limit],
      ) as unknown as DbMediaCache[],

    getCacheStats: () =>
      get<{ total: number; totalRequests: number | null }>(
        'SELECT COUNT(*) as total, SUM(request_count) as totalRequests FROM media_cache',
      ) as unknown as { total: number; totalRequests: number },

    logRequest: ({ userId, urlHash, wasCached }) =>
      void run(
        'INSERT INTO requests (user_id, url_hash, was_cached) VALUES (?, ?, ?)',
        [userId, urlHash, wasCached ? 1 : 0],
      ),

    getStats: () => {
      throw new Error('D1 getStats must be called asynchronously');
    },

    saveBroadcast: ({ adminId, messageText, telegramMessageId, target }) => {
      void run(
        `INSERT INTO broadcasts (admin_id, message_text, telegram_message_id, target)
         VALUES (?, ?, ?, ?)`,
        [adminId, messageText ?? null, telegramMessageId ?? null, target],
      );
      return 0;
    },

    updateBroadcastSentCount: (id, count) =>
      void run('UPDATE broadcasts SET sent_count = ? WHERE id = ?', [count, id]),
  };
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _adapter: DbAdapter | null = null;

export function getDb(): DbAdapter {
  if (!_adapter) {
    const dbPath = process.env['DB_PATH'] ?? './data/bot.db';
    _adapter = createSQLiteAdapter(dbPath);
  }
  return _adapter;
}

export function setDb(adapter: DbAdapter): void {
  _adapter = adapter;
}
