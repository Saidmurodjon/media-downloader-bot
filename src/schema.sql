CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  telegram_id INTEGER UNIQUE NOT NULL,
  username TEXT,
  first_name TEXT,
  language TEXT DEFAULT 'uz',
  is_blocked INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  last_active TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS media_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url_hash TEXT UNIQUE NOT NULL,
  original_url TEXT NOT NULL,
  platform TEXT NOT NULL,
  telegram_file_id TEXT NOT NULL,
  file_type TEXT NOT NULL,
  title TEXT,
  downloaded_at TEXT DEFAULT (datetime('now')),
  request_count INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  url_hash TEXT NOT NULL,
  requested_at TEXT DEFAULT (datetime('now')),
  was_cached INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(telegram_id)
);

CREATE TABLE IF NOT EXISTS broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  message_text TEXT,
  telegram_message_id INTEGER,
  target TEXT DEFAULT 'all',
  sent_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_media_url_hash ON media_cache(url_hash);
CREATE INDEX IF NOT EXISTS idx_requests_user ON requests(user_id);
CREATE INDEX IF NOT EXISTS idx_requests_date ON requests(requested_at);
