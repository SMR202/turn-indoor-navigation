import { DatabaseSync } from 'node:sqlite';

/** SQLite schema (node:sqlite, no native dependency). Local-first; a hosted Postgres can replace it later. */
export function openDb(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS orgs (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, plan TEXT NOT NULL DEFAULT 'pilot',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('staff','owner','editor')),
      org_id TEXT REFERENCES orgs(id), created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS venues (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id), name TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '', visibility TEXT NOT NULL DEFAULT 'public'
        CHECK (visibility IN ('public','private-lan')),
      content TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, venue_id TEXT NOT NULL REFERENCES venues(id),
      number INTEGER NOT NULL, status TEXT NOT NULL CHECK (status IN ('draft','published','archived')),
      package TEXT NOT NULL, content TEXT NOT NULL DEFAULT '{}', notes TEXT NOT NULL DEFAULT '',
      created_by TEXT, created_at TEXT NOT NULL, published_at TEXT
    );
    CREATE INDEX IF NOT EXISTS versions_venue ON versions(venue_id, status);
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, venue_id TEXT NOT NULL, type TEXT NOT NULL,
      place_id TEXT, query TEXT, session TEXT NOT NULL, at TEXT NOT NULL, sample INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS events_venue_at ON events(venue_id, at);
    CREATE TABLE IF NOT EXISTS beacon_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT, venue_id TEXT NOT NULL, tag TEXT NOT NULL,
      rssi REAL, battery REAL, at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS eval_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT, venue_id TEXT NOT NULL, summary TEXT NOT NULL, at TEXT NOT NULL
    );
  `);
  return db;
}
export type Db = ReturnType<typeof openDb>;
