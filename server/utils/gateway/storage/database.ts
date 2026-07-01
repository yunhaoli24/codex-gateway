import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

let database: DatabaseSync | null = null;
let ready = false;
const readyCallbacks = new Set<() => void>();

function gatewayDatabasePath() {
  return resolve(process.env.CODEX_GATEWAY_DB_PATH || "/data/codex-gateway.db");
}

export function gatewayDatabaseExists() {
  return existsSync(gatewayDatabasePath());
}

export function gatewayDatabaseReady() {
  return ready;
}

export function onGatewayDatabaseReady(callback: () => void) {
  readyCallbacks.add(callback);
  if (ready) {
    callback();
  }
  return () => {
    readyCallbacks.delete(callback);
  };
}

export function gatewayDatabase() {
  if (!database) {
    const path = gatewayDatabasePath();
    const directory = dirname(path);
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
    }
    database = new DatabaseSync(path);
    database.exec("PRAGMA journal_mode = WAL");
    database.exec("PRAGMA foreign_keys = ON");
    database.exec("PRAGMA busy_timeout = 5000");
    migrate(database);
    markGatewayDatabaseReady();
  }
  return database;
}

function markGatewayDatabaseReady() {
  if (ready) {
    return;
  }
  ready = true;
  for (const callback of Array.from(readyCallbacks)) {
    callback();
  }
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_configs (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      encrypted_config_json TEXT NOT NULL,
      config_version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `);
}
