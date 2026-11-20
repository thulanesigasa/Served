CREATE TABLE venues (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  staff_hash TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE tickets (
  number INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  venue_id TEXT NOT NULL REFERENCES venues(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('table', 'order')),
  size INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'ready', 'done', 'cancelled')),
  created_at INTEGER NOT NULL,
  called_at INTEGER,
  closed_at INTEGER
);
--> statement-breakpoint
CREATE INDEX tickets_queue ON tickets (venue_id, status, number);
