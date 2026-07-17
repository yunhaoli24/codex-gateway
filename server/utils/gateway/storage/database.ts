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

export function withGatewayDatabaseTransaction<T>(callback: (db: DatabaseSync) => T): T {
  const db = gatewayDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback(db);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
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
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tmux_monitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      host_id INTEGER NOT NULL,
      project_id INTEGER,
      thread_id TEXT,
      thread_title TEXT,
      session_name TEXT NOT NULL,
      session_id TEXT NOT NULL,
      session_created INTEGER NOT NULL,
      window_index INTEGER NOT NULL,
      window_name TEXT NOT NULL,
      pane_index INTEGER NOT NULL,
      pane_id TEXT NOT NULL,
      pane_pid INTEGER NOT NULL,
      initial_command TEXT NOT NULL,
      last_command TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'once' CHECK (mode IN ('once', 'permanent')),
      status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'cancelled')),
      completion_reason TEXT,
      created_at TEXT NOT NULL,
      run_started_at TEXT,
      last_checked_at TEXT,
      completed_at TEXT,
      last_error TEXT,
      last_error_at TEXT,
      notification_sent_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_tmux_monitors_host
      ON tmux_monitors(user_id, host_id, status, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tmux_monitors_active_location
      ON tmux_monitors(user_id, host_id, session_name, window_index, pane_index)
      WHERE status = 'active';
  `);
}
