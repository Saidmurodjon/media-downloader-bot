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

export interface DbStats {
  totalUsers: number;
  totalRequests: number;
  cacheHits: number;
  youtubeCount: number;
  instagramCount: number;
  todayRequests: number;
}

// ─── Async-first adapter interface ───────────────────────────────────────────
// Both SQLite (Bun) and D1 (Cloudflare) implement this interface.
// SQLite wraps sync calls in Promise.resolve(); D1 is natively async.

export interface DbAdapter {
  // Users
  getUser(telegramId: number): Promise<DbUser | null>;
  upsertUser(data: {
    telegramId: number;
    username?: string | null;
    firstName?: string | null;
    language?: string;
  }): Promise<void>;
  updateUserLanguage(telegramId: number, language: string): Promise<void>;
  updateUserActivity(telegramId: number): Promise<void>;
  getAllUsers(): Promise<DbUser[]>;
  blockUser(telegramId: number, blocked: boolean): Promise<void>;

  // Media cache
  getCachedMedia(urlHash: string): Promise<DbMediaCache | null>;
  saveMediaCache(data: {
    urlHash: string;
    originalUrl: string;
    platform: string;
    telegramFileId: string;
    fileType: string;
    title?: string | null;
  }): Promise<void>;
  incrementCacheCount(urlHash: string): Promise<void>;
  getTopUrls(limit: number): Promise<DbMediaCache[]>;
  getCacheStats(): Promise<{ total: number; totalRequests: number }>;

  // Requests
  logRequest(data: { userId: number; urlHash: string; wasCached: boolean }): Promise<void>;
  getStats(): Promise<DbStats>;

  // Broadcasts
  saveBroadcast(data: {
    adminId: number;
    messageText?: string | null;
    telegramMessageId?: number | null;
    target: string;
  }): Promise<number>;
  updateBroadcastSentCount(id: number, count: number): Promise<void>;

  // Schema (one-time init)
  runSchema(sql: string): Promise<void>;
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
  const run = (sql: string, params: unknown[] = []) =>
    d1.prepare(sql).bind(...params).run().then(() => undefined);

  const get = <T>(sql: string, params: unknown[] = []) =>
    d1.prepare(sql).bind(...params).first<T>();

  const all = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
    const result = await d1.prepare(sql).bind(...params).all<T>();
    return result.results ?? [];
  };

  return {
    runSchema: async (sql) => {
      const stmts = sql.split(';').map((s) => s.trim()).filter(Boolean);
      await Promise.all(stmts.map((s) => d1.prepare(s).run()));
    },

    getUser: (telegramId) =>
      get<DbUser>('SELECT * FROM users WHERE telegram_id = ?', [telegramId]),

    upsertUser: ({ telegramId, username, firstName, language = 'uz' }) =>
      run(
        `INSERT INTO users (telegram_id, username, first_name, language)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(telegram_id) DO UPDATE SET
           username    = excluded.username,
           first_name  = excluded.first_name,
           last_active = datetime('now')`,
        [telegramId, username ?? null, firstName ?? null, language],
      ),

    updateUserLanguage: (telegramId, language) =>
      run(
        "UPDATE users SET language = ?, last_active = datetime('now') WHERE telegram_id = ?",
        [language, telegramId],
      ),

    updateUserActivity: (telegramId) =>
      run(
        "UPDATE users SET last_active = datetime('now') WHERE telegram_id = ?",
        [telegramId],
      ),

    getAllUsers: () =>
      all<DbUser>('SELECT * FROM users WHERE is_blocked = 0'),

    blockUser: (telegramId, blocked) =>
      run('UPDATE users SET is_blocked = ? WHERE telegram_id = ?', [
        blocked ? 1 : 0,
        telegramId,
      ]),

    getCachedMedia: (urlHash) =>
      get<DbMediaCache>('SELECT * FROM media_cache WHERE url_hash = ?', [urlHash]),

    saveMediaCache: ({ urlHash, originalUrl, platform, telegramFileId, fileType, title }) =>
      run(
        `INSERT INTO media_cache (url_hash, original_url, platform, telegram_file_id, file_type, title)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(url_hash) DO UPDATE SET
           telegram_file_id = excluded.telegram_file_id,
           request_count    = request_count + 1`,
        [urlHash, originalUrl, platform, telegramFileId, fileType, title ?? null],
      ),

    incrementCacheCount: (urlHash) =>
      run(
        'UPDATE media_cache SET request_count = request_count + 1 WHERE url_hash = ?',
        [urlHash],
      ),

    getTopUrls: (limit) =>
      all<DbMediaCache>(
        'SELECT * FROM media_cache ORDER BY request_count DESC LIMIT ?',
        [limit],
      ),

    getCacheStats: async () => {
      const row = await get<{ total: number; totalRequests: number | null }>(
        'SELECT COUNT(*) as total, SUM(request_count) as totalRequests FROM media_cache',
      );
      return { total: row?.total ?? 0, totalRequests: row?.totalRequests ?? 0 };
    },

    logRequest: ({ userId, urlHash, wasCached }) =>
      run(
        'INSERT INTO requests (user_id, url_hash, was_cached) VALUES (?, ?, ?)',
        [userId, urlHash, wasCached ? 1 : 0],
      ),

    getStats: async () => {
      const [users, requests, cacheHitsRow, ytRow, igRow, todayRow] = await Promise.all([
        get<{ n: number }>('SELECT COUNT(*) as n FROM users'),
        get<{ n: number }>('SELECT COUNT(*) as n FROM requests'),
        get<{ n: number }>('SELECT COUNT(*) as n FROM requests WHERE was_cached = 1'),
        get<{ n: number }>("SELECT COUNT(*) as n FROM media_cache WHERE platform = 'youtube'"),
        get<{ n: number }>("SELECT COUNT(*) as n FROM media_cache WHERE platform = 'instagram'"),
        get<{ n: number }>("SELECT COUNT(*) as n FROM requests WHERE date(requested_at) = date('now')"),
      ]);
      return {
        totalUsers: users?.n ?? 0,
        totalRequests: requests?.n ?? 0,
        cacheHits: cacheHitsRow?.n ?? 0,
        youtubeCount: ytRow?.n ?? 0,
        instagramCount: igRow?.n ?? 0,
        todayRequests: todayRow?.n ?? 0,
      };
    },

    saveBroadcast: async ({ adminId, messageText, telegramMessageId, target }) => {
      await run(
        `INSERT INTO broadcasts (admin_id, message_text, telegram_message_id, target)
         VALUES (?, ?, ?, ?)`,
        [adminId, messageText ?? null, telegramMessageId ?? null, target],
      );
      const row = await get<{ id: number }>(
        'SELECT id FROM broadcasts WHERE admin_id = ? ORDER BY id DESC LIMIT 1',
        [adminId],
      );
      return row?.id ?? 0;
    },

    updateBroadcastSentCount: (id, count) =>
      run('UPDATE broadcasts SET sent_count = ? WHERE id = ?', [count, id]),
  };
}

// ─── Singleton (Bun local mode) ───────────────────────────────────────────────
// In Workers mode, call setDb(createD1Adapter(env.DB)) at request start.
// In Bun mode, index.ts calls setDb(createSQLiteAdapter(path)).

let _adapter: DbAdapter | null = null;

export function getDb(): DbAdapter {
  if (!_adapter) {
    throw new Error(
      'DB adapter not initialized. Call setDb() before using getDb().',
    );
  }
  return _adapter;
}

export function setDb(adapter: DbAdapter): void {
  _adapter = adapter;
}
