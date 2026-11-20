CREATE TABLE guest_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE guest_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  guest_id TEXT NOT NULL REFERENCES guest_accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX guest_sessions_expiration ON guest_sessions (expires_at);
--> statement-breakpoint
CREATE TABLE guest_auth_limits (
  key TEXT PRIMARY KEY NOT NULL,
  hits INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX guest_auth_limits_expiration ON guest_auth_limits (expires_at);
--> statement-breakpoint
CREATE INDEX tickets_call_pace ON tickets (venue_id, kind, called_at) WHERE called_at IS NOT NULL;
