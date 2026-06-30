#!/usr/bin/env node
import { argon2Sync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const [, , usernameArg, passwordArg] = process.argv;
const username = (usernameArg || "").trim().toLowerCase();
const password = passwordArg || "";

if (!username || !password) {
  console.error("Usage: node scripts/create-user.mjs <username> <password>");
  process.exit(1);
}

if (password.length < 8) {
  console.error("Password must be at least 8 characters");
  process.exit(1);
}

const dbPath = resolve(process.env.CODEX_GATEWAY_DB_PATH || "/data/codex-gateway.db");
const directory = dirname(dbPath);
if (!existsSync(directory)) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
}

const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const now = new Date().toISOString();
db.prepare(
  `
    INSERT INTO users (username, password_hash, is_active, created_at, updated_at)
    VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
      password_hash = excluded.password_hash,
      is_active = 1,
      updated_at = excluded.updated_at
  `,
).run(username, hashPassword(password), now, now);

console.log(`User ${username} is ready in ${dbPath}`);

function hashPassword(value) {
  const salt = randomBytes(16);
  const hash = argon2Sync("argon2id", {
    message: Buffer.from(value),
    nonce: salt,
    tagLength: 32,
    memory: 64 * 1024,
    passes: 3,
    parallelism: 1,
  });
  return `argon2id$${salt.toString("base64url")}$${Buffer.from(hash).toString("base64url")}`;
}
