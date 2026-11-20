CREATE TABLE table_reservations (
  table_id TEXT PRIMARY KEY NOT NULL REFERENCES dining_tables(id) ON DELETE CASCADE,
  holder_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX food_orders_table_status ON food_orders (table_id, status);
