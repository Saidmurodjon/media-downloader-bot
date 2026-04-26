CREATE TABLE IF NOT EXISTS users (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  chatId    INTEGER UNIQUE NOT NULL,
  username  TEXT,
  firstName TEXT    NOT NULL,
  language  TEXT    NOT NULL DEFAULT 'en',
  isAdmin   INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS media_cache (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  urlHash   TEXT    UNIQUE NOT NULL,
  fileId    TEXT    NOT NULL,
  mediaType TEXT    NOT NULL,
  createdAt TEXT    NOT NULL DEFAULT (datetime('now'))
);
