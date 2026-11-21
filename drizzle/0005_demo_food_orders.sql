CREATE TABLE demo_food_orders (
  id TEXT PRIMARY KEY NOT NULL,
  venue_id TEXT NOT NULL REFERENCES venues(id),
  table_id TEXT REFERENCES dining_tables(id),
  items TEXT NOT NULL,
  total INTEGER NOT NULL CHECK (total > 0),
  status TEXT NOT NULL CHECK (status IN ('placed', 'preparing', 'ready', 'delivered')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX demo_food_orders_staff ON demo_food_orders (venue_id, created_at DESC);
