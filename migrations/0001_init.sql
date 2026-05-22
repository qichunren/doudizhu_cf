CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  account TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  nickname TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 1000,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  user_id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
