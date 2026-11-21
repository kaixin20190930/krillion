CREATE TABLE IF NOT EXISTS dives (
  date TEXT PRIMARY KEY, dive INTEGER NOT NULL, revision INTEGER NOT NULL,
  content_hash TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL,
  last_checked_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS revisions (
  date TEXT NOT NULL, revision INTEGER NOT NULL, content_hash TEXT NOT NULL,
  raw_key TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (date, revision)
);
CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS locks (name TEXT PRIMARY KEY, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS observations (
  date TEXT PRIMARY KEY, dive INTEGER NOT NULL, first_seen TEXT NOT NULL,
  prior_seen TEXT, scheduled_reset TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, date TEXT,
  outcome TEXT NOT NULL, detail TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS outbox (
  event_key TEXT PRIMARY KEY, subject TEXT NOT NULL, body TEXT NOT NULL,
  created_at TEXT NOT NULL, sent_at TEXT, attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt TEXT, receipt TEXT
);
