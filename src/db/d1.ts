/// <reference types="@cloudflare/workers-types" />
import type { DbAdapter, User, MediaCache } from '../types.ts';

// Cloudflare D1 adapter — used in src/worker.ts
export class D1Adapter implements DbAdapter {
  constructor(private readonly d1: D1Database) {}

  async init(): Promise<void> {
    // Use separate prepare().run() calls — more reliable than exec() with multi-statements
    await this.d1.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        chatId    INTEGER UNIQUE NOT NULL,
        username  TEXT,
        firstName TEXT    NOT NULL,
        language  TEXT    NOT NULL DEFAULT 'en',
        isAdmin   INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `).run();

    await this.d1.prepare(`
      CREATE TABLE IF NOT EXISTS media_cache (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        urlHash   TEXT    UNIQUE NOT NULL,
        fileId    TEXT    NOT NULL,
        mediaType TEXT    NOT NULL,
        createdAt TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `).run();
  }

  async getUser(chatId: number): Promise<User | null> {
    const result = await this.d1
      .prepare('SELECT * FROM users WHERE chatId = ?')
      .bind(chatId)
      .first<User>();
    return result ?? null;
  }

  async createUser(user: Omit<User, 'id' | 'createdAt'>): Promise<void> {
    await this.d1
      .prepare(
        'INSERT OR IGNORE INTO users (chatId, username, firstName, language, isAdmin) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(user.chatId, user.username, user.firstName, user.language, user.isAdmin)
      .run();
  }

  async updateUser(chatId: number, data: Partial<Pick<User, 'language' | 'isAdmin'>>): Promise<void> {
    const sets: string[] = [];
    const values: (string | number)[] = [];
    if (data.language !== undefined) { sets.push('language = ?'); values.push(data.language); }
    if (data.isAdmin !== undefined) { sets.push('isAdmin = ?'); values.push(data.isAdmin); }
    if (sets.length === 0) return;
    values.push(chatId);
    await this.d1
      .prepare(`UPDATE users SET ${sets.join(', ')} WHERE chatId = ?`)
      .bind(...values)
      .run();
  }

  async getAllUsers(): Promise<User[]> {
    const result = await this.d1.prepare('SELECT * FROM users').all<User>();
    return result.results;
  }

  async getUserCount(): Promise<number> {
    const result = await this.d1
      .prepare('SELECT COUNT(*) as count FROM users')
      .first<{ count: number }>();
    return result?.count ?? 0;
  }

  async getCachedMedia(urlHash: string): Promise<MediaCache | null> {
    const result = await this.d1
      .prepare('SELECT * FROM media_cache WHERE urlHash = ?')
      .bind(urlHash)
      .first<MediaCache>();
    return result ?? null;
  }

  async setCachedMedia(urlHash: string, fileId: string, mediaType: MediaCache['mediaType']): Promise<void> {
    await this.d1
      .prepare('INSERT OR REPLACE INTO media_cache (urlHash, fileId, mediaType) VALUES (?, ?, ?)')
      .bind(urlHash, fileId, mediaType)
      .run();
  }
}
