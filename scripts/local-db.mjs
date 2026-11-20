import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function localDb(filename = ':memory:') {
  const sqlite = new DatabaseSync(filename);
  if (!sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tickets'").get()) {
    sqlite.exec('BEGIN');
    try {
      sqlite.exec(readFileSync(new URL('../drizzle/0000_served.sql', import.meta.url), 'utf8'));
      sqlite.exec('COMMIT');
    } catch (error) {
      sqlite.exec('ROLLBACK');
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
