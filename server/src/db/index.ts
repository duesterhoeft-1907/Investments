import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../env.js';

const here = path.dirname(fileURLToPath(import.meta.url));

fs.mkdirSync(path.dirname(env.dbFile), { recursive: true });
fs.mkdirSync(env.uploadDir, { recursive: true });

export const db = new Database(env.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/** Legt fehlende Tabellen an. Das Schema ist idempotent (CREATE TABLE IF NOT EXISTS). */
export function migrate(): void {
  // Beim Build landet schema.sql nicht in dist/, deshalb beide Orte pruefen.
  const candidates = [
    path.join(here, 'schema.sql'),
    path.join(here, '..', '..', 'src', 'db', 'schema.sql'),
  ];
  const file = candidates.find((c) => fs.existsSync(c));
  if (!file) throw new Error(`schema.sql nicht gefunden (gesucht: ${candidates.join(', ')})`);
  db.exec(fs.readFileSync(file, 'utf8'));
}

/** Kleiner Key/Value-Store fuer Laufzeit-Einstellungen. */
export const settings = {
  get(key: string, fallback = ''): string {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? fallback;
  },
  set(key: string, value: string): void {
    db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(key, value);
  },
};
