CREATE TABLE dining_tables (
  id TEXT PRIMARY KEY NOT NULL,
  venue_id TEXT NOT NULL REFERENCES venues(id),
  label TEXT NOT NULL,
  UNIQUE (venue_id, label)
);
--> statement-breakpoint
CREATE TABLE menu_items (
  id TEXT PRIMARY KEY NOT NULL,
  venue_id TEXT NOT NULL REFERENCES venues(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL CHECK (price > 0),
  available INTEGER NOT NULL DEFAULT 1
);
--> statement-breakpoint
CREATE INDEX menu_items_venue ON menu_items (venue_id, available);
--> statement-breakpoint
CREATE TABLE food_orders (
  number INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  venue_id TEXT NOT NULL REFERENCES venues(id),
  table_id TEXT NOT NULL REFERENCES dining_tables(id),
  guest_id TEXT REFERENCES guest_accounts(id),
  guest_name TEXT NOT NULL,
  email TEXT NOT NULL,
  items TEXT NOT NULL,
  total INTEGER NOT NULL CHECK (total > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'preparing', 'ready', 'delivered')),
  payment_url TEXT,
  initializing_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX food_orders_staff ON food_orders (venue_id, status, updated_at);
--> statement-breakpoint
CREATE INDEX food_orders_guest ON food_orders (guest_id, number DESC);
--> statement-breakpoint
CREATE TABLE shop_visits (
  guest_id TEXT NOT NULL REFERENCES guest_accounts(id) ON DELETE CASCADE,
  venue_id TEXT NOT NULL REFERENCES venues(id),
  visited_at INTEGER NOT NULL,
  PRIMARY KEY (guest_id, venue_id)
);
