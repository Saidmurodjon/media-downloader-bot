import { Database } from 'bun:sqlite';
import type { DbAdapter, DbUser, DbMediaCache } from './db.js';

export function createSQLiteAdapter(dbPath: string): DbAdapter {
  const db = new Database(dbPath, { create: true });
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA synchronous = NORMAL');

  type Param = string | number | bigint | boolean | null | undefined;
  const run = (sql: string, params: Param[] = []) => db.run(sql, params as never);
  const get = <T>(sql: string, params: Param[] = []): T | null =>
    (db.query(sql).get(params as never) as T | undefined) ?? null;
  const all = <T>(sql: string, params: Param[] = []): T[] =>
    db.query(sql).all(params as never) as T[];

  return {
    async runSchema(sql) {
      for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
        db.run(stmt);
      }
    },

    async getUser(telegramId) {
      return get<DbUser>('SELECT * FROM users WHERE telegram_id = ?', [telegramId]);
    },

    async upsertUser({ telegramId, username, firstName, language = 'uz' }) {
      run(
        `INSERT INTO users (telegram_id, username, first_name, language)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(telegram_id) DO UPDATE SET
           username    = excluded.username,
           first_name  = excluded.first_name,
           last_active = datetime('now')`,
        [telegramId, username ?? null, firstName ?? null, language],
      );
    },

    async updateUserLanguage(telegramId, language) {
      run(
        "UPDATE users SET language = ?, last_active = datetime('now') WHERE telegram_id = ?",
        [language, telegramId],
      );
    },

    async updateUserActivity(telegramId) {
      run(
        "UPDATE users SET last_active = datetime('now') WHERE telegram_id = ?",
        [telegramId],
      );
    },

    async getAllUsers() {
      return all<DbUser>('SELECT * FROM users WHERE is_blocked = 0');
    },

    async blockUser(telegramId, blocked) {
      run('UPDATE users SET is_blocked = ? WHERE telegram_id = ?', [
        blocked ? 1 : 0,
        telegramId,
      ]);
    },

    async getCachedMedia(urlHash) {
      return get<DbMediaCache>('SELECT * FROM media_cache WHERE url_hash = ?', [urlHash]);
    },

    async saveMediaCache({ urlHash, originalUrl, platform, telegramFileId, fileType, title }) {
      run(
        `INSERT INTO media_cache (url_hash, original_url, platform, telegram_file_id, file_type, title)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(url_hash) DO UPDATE SET
           telegram_file_id = excluded.telegram_file_id,
           request_count    = request_count + 1`,
        [urlHash, originalUrl, platform, telegramFileId, fileType, title ?? null],
      );
    },

    async incrementCacheCount(urlHash) {
      run(
        'UPDATE media_cache SET request_count = request_count + 1 WHERE url_hash = ?',
        [urlHash],
      );
    },

    async getTopUrls(limit) {
      return all<DbMediaCache>(
        'SELECT * FROM media_cache ORDER BY request_count DESC LIMIT ?',
        [limit],
      );
    },

    async getCacheStats() {
      const row = get<{ total: number; totalRequests: number | null }>(
        'SELECT COUNT(*) as total, SUM(request_count) as totalRequests FROM media_cache',
      );
      return { total: row?.total ?? 0, totalRequests: row?.totalRequests ?? 0 };
    },

    async logRequest({ userId, urlHash, wasCached }) {
      run('INSERT INTO requests (user_id, url_hash, was_cached) VALUES (?, ?, ?)', [
        userId, urlHash, wasCached ? 1 : 0,
      ]);
    },

    async getStats() {
      const n = (sql: string) => (get<{ n: number }>(sql)?.n ?? 0);
      return {
        totalUsers:     n('SELECT COUNT(*) as n FROM users'),
        totalRequests:  n('SELECT COUNT(*) as n FROM requests'),
        cacheHits:      n('SELECT COUNT(*) as n FROM requests WHERE was_cached = 1'),
        youtubeCount:   n("SELECT COUNT(*) as n FROM media_cache WHERE platform = 'youtube'"),
        instagramCount: n("SELECT COUNT(*) as n FROM media_cache WHERE platform = 'instagram'"),
        todayRequests:  n("SELECT COUNT(*) as n FROM requests WHERE date(requested_at) = date('now')"),
      };
    },

    async saveBroadcast({ adminId, messageText, telegramMessageId, target }) {
      run(
        `INSERT INTO broadcasts (admin_id, message_text, telegram_message_id, target)
         VALUES (?, ?, ?, ?)`,
        [adminId, messageText ?? null, telegramMessageId ?? null, target],
      );
      return get<{ id: number }>('SELECT last_insert_rowid() as id')?.id ?? 0;
    },

    async updateBroadcastSentCount(id, count) {
      run('UPDATE broadcasts SET sent_count = ? WHERE id = ?', [count, id]);
    },
  };
}
