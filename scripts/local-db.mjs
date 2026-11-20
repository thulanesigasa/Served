import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

export function localDb(filename = ':memory:') {
  const sqlite = new DatabaseSync(filename);
  const migrations = new URL('../drizzle/', import.meta.url);
  sqlite.exec('CREATE TABLE IF NOT EXISTS served_local_migrations (name TEXT PRIMARY KEY)');
  const applied = sqlite.prepare('SELECT 1 FROM served_local_migrations WHERE name = ?');
  const record = sqlite.prepare('INSERT INTO served_local_migrations (name) VALUES (?)');
  const existingQueue = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tickets'").get();
  if (existingQueue && !applied.get('0000_served.sql')) record.run('0000_served.sql');
  for (const name of readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) {
    if (applied.get(name)) continue;
    sqlite.exec('BEGIN');
    try {
      sqlite.exec(readFileSync(new URL(name, migrations), 'utf8'));
      record.run(name);
      sqlite.exec('COMMIT');
    } catch (error) {
      sqlite.exec('ROLLBACK');
      sqlite.close();
      throw error;
    }
  }
  return {
    close: () => sqlite.close(),
    prepare: sql => ({
      bind: (...values) => ({
        first: async () => sqlite.prepare(sql).get(...values) ?? null,
        all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
        run: async () => sqlite.prepare(sql).run(...values),
      }),
    }),
  };
}
