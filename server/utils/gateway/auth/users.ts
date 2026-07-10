import { randomBytes } from "node:crypto";
import type { GatewayConfig } from "~~/shared/types";
import { defaultGatewayConfig } from "../../../../shared/config";
import { gatewayDatabase, gatewayDatabaseExists } from "../storage/database";
import {
  decryptJson,
  encryptJson,
  hashPassword,
  hashToken,
  verifyPassword,
} from "../storage/crypto";
import { sessionRevocationEvents } from "./session-events";

export interface AuthenticatedUser {
  id: number;
  username: string;
}

export interface AuthSession {
  token: string;
  expiresAt: string;
  user: AuthenticatedUser;
}

export class ConfigRevisionConflictError extends Error {
  readonly statusCode = 409;
  readonly code = "configConflict";

  constructor(
    readonly expectedRevision: number,
    readonly actualRevision: number,
  ) {
    super("Configuration changed in another browser tab. Refresh the page and try again.");
    this.name = "ConfigRevisionConflictError";
  }
}

const SESSION_DAYS = 30;

export const userStore = {
  createUser(username: string, password: string) {
    const normalized = normalizeUsername(username);
    if (!normalized) {
      throw new Error("Username is required");
    }
    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }
    const now = new Date().toISOString();
    gatewayDatabase()
      .prepare(
        "INSERT INTO users (username, password_hash, is_active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)",
      )
      .run(normalized, hashPassword(password), now, now);
    return this.findByUsername(normalized);
  },

  findByUsername(username: string) {
    const row = gatewayDatabase()
      .prepare("SELECT id, username, password_hash, is_active FROM users WHERE username = ?")
      .get(normalizeUsername(username));
    return row
      ? {
          id: Number(row.id),
          username: String(row.username),
          passwordHash: String(row.password_hash),
          isActive: Number(row.is_active) === 1,
        }
      : null;
  },

  async login(username: string, password: string): Promise<AuthSession | null> {
    const user = this.findByUsername(username);
    if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
      return null;
    }
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
    const now = new Date().toISOString();
    gatewayDatabase()
      .prepare(
        "INSERT INTO sessions (user_id, token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(user.id, hashToken(token), expiresAt, now, now);
    return {
      token,
      expiresAt,
      user: { id: user.id, username: user.username },
    };
  },

  authenticateToken(token: string): AuthenticatedUser | null {
    if (!token) {
      return null;
    }
    const row = gatewayDatabase()
      .prepare(
        `
          SELECT users.id, users.username, users.is_active, sessions.expires_at
          FROM sessions
          JOIN users ON users.id = sessions.user_id
          WHERE sessions.token_hash = ?
        `,
      )
      .get(hashToken(token));
    if (!row || Number(row.is_active) !== 1) {
      return null;
    }
    if (Date.parse(String(row.expires_at)) <= Date.now()) {
      this.deleteToken(token);
      return null;
    }
    gatewayDatabase()
      .prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?")
      .run(new Date().toISOString(), hashToken(token));
    return { id: Number(row.id), username: String(row.username) };
  },

  deleteToken(token: string) {
    const tokenHash = hashToken(token);
    const result = gatewayDatabase()
      .prepare("DELETE FROM sessions WHERE token_hash = ?")
      .run(tokenHash);
    if (result.changes > 0) {
      sessionRevocationEvents.emit(tokenHash);
    }
  },

  deleteExpiredSessions() {
    const now = new Date().toISOString();
    const rows = gatewayDatabase()
      .prepare("SELECT token_hash FROM sessions WHERE expires_at <= ?")
      .all(now);
    if (!rows.length) {
      return 0;
    }
    const result = gatewayDatabase().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
    for (const row of rows) {
      sessionRevocationEvents.emit(String(row.token_hash));
    }
    return Number(result.changes);
  },

  loadConfigSnapshot(userId: number): { config: GatewayConfig; revision: number } {
    const row = gatewayDatabase()
      .prepare("SELECT encrypted_config_json, revision FROM user_configs WHERE user_id = ?")
      .get(userId);
    if (!row?.encrypted_config_json) {
      return { config: defaultGatewayConfig(), revision: 0 };
    }
    return {
      config: {
        ...defaultGatewayConfig(),
        ...decryptJson<GatewayConfig>(String(row.encrypted_config_json)),
      },
      revision: Number(row.revision),
    };
  },

  configRevision(userId: number) {
    const row = gatewayDatabase()
      .prepare("SELECT revision FROM user_configs WHERE user_id = ?")
      .get(userId);
    return row ? Number(row.revision) : 0;
  },

  assertConfigRevision(userId: number, expectedRevision: number) {
    const actualRevision = this.configRevision(userId);
    if (actualRevision !== expectedRevision) {
      throw new ConfigRevisionConflictError(expectedRevision, actualRevision);
    }
  },

  saveConfig(userId: number, config: GatewayConfig, expectedRevision?: number) {
    const actualRevision = this.configRevision(userId);
    if (expectedRevision !== undefined && actualRevision !== expectedRevision) {
      throw new ConfigRevisionConflictError(expectedRevision, actualRevision);
    }
    const revision = actualRevision + 1;
    const encrypted = encryptJson(config);
    const now = new Date().toISOString();
    gatewayDatabase()
      .prepare(
        `
          INSERT INTO user_configs (user_id, encrypted_config_json, config_version, revision, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            encrypted_config_json = excluded.encrypted_config_json,
            config_version = excluded.config_version,
            revision = excluded.revision,
            updated_at = excluded.updated_at
        `,
      )
      .run(userId, encrypted, config.version || 1, revision, now);
    return revision;
  },

  listStoredConfigs(): Array<{ user: AuthenticatedUser; config: GatewayConfig }> {
    if (!gatewayDatabaseExists()) {
      return [];
    }
    const rows = gatewayDatabase()
      .prepare(
        `
          SELECT users.id, users.username, user_configs.encrypted_config_json
          FROM users
          JOIN user_configs ON user_configs.user_id = users.id
          WHERE users.is_active = 1
          ORDER BY users.id ASC
        `,
      )
      .all();
    return rows.map((row: any) => ({
      user: {
        id: Number(row.id),
        username: String(row.username),
      },
      config: {
        ...defaultGatewayConfig(),
        ...decryptJson<GatewayConfig>(String(row.encrypted_config_json)),
      },
    }));
  },
};

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}
