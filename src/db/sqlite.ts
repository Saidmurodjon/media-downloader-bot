import { Database } from 'bun:sqlite';
import type { DbAdapter, User, MediaCache } from '../types.ts';

export class SqliteAdapter implements DbAdapter {
  private db: Database;

  constructor(path: string = './data.db') {
    this.db = new Database(path, { create: true });
    this.db.run('PRAGMA journal_mode=WAL');
    this.db.run('PRAGMA foreign_keys=ON');
  }

  async init(): Promise<void> {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chatId INTEGER UNIQUE NOT NULL,
        username TEXT,
        firstName TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'en',
        isAdmin INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS media_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        urlHash TEXT UNIQUE NOT NULL,
        fileId TEXT NOT NULL,
        mediaType TEXT NOT NULL,
        createdAt TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  async getUser(chatId: number): Promise<User | null> {
    const row = this.db.query('SELECT * FROM users WHERE chatId = ?').get(chatId);
    return (row as User | null);
  }

  async createUser(user: Omit<User, 'id' | 'createdAt'>): Promise<void> {
    this.db.run(
      'INSERT OR IGNORE INTO users (chatId, username, firstName, language, isAdmin) VALUES (?, ?, ?, ?, ?)',
      [user.chatId, user.username, user.firstName, user.language, user.isAdmin],
    );
  }

  async updateUser(chatId: number, data: Partial<Pick<User, 'language' | 'isAdmin'>>): Promise<void> {
    const sets: string[] = [];
    const values: (string | number)[] = [];
    if (data.language !== undefined) { sets.push('language = ?'); values.push(data.language); }
    if (data.isAdmin !== undefined) { sets.push('isAdmin = ?'); values.push(data.isAdmin); }
    if (sets.length === 0) return;
    values.push(chatId);
    this.db.run(`UPDATE users SET ${sets.join(', ')} WHERE chatId = ?`, values);
  }

  async getAllUsers(): Promise<User[]> {
    return this.db.query('SELECT * FROM users').all() as User[];
  }

  async getUserCount(): Promise<number> {
    const row = this.db.query('SELECT COUNT(*) as count FROM users').get() as { count: number };
    return row.count;
  }

  async getCachedMedia(urlHash: string): Promise<MediaCache | null> {
    const row = this.db.query('SELECT * FROM media_cache WHERE urlHash = ?').get(urlHash);
    return (row as MediaCache | null);
  }

  async setCachedMedia(urlHash: string, fileId: string, mediaType: MediaCache['mediaType']): Promise<void> {
    this.db.run(
      'INSERT OR REPLACE INTO media_cache (urlHash, fileId, mediaType) VALUES (?, ?, ?)',
      [urlHash, fileId, mediaType],
    );
  }
}
