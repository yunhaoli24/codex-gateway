import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SocksClient } from "socks";
import type { HostWithSecret } from "./ssh-types";

export function expandHome(path: string) {
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

export function resolveSshConfig(host: HostWithSecret) {
  const configPath = join(homedir(), ".ssh", "config");
  const result = {
    hostName: host.sshHost,
    username: host.username ?? undefined,
    port: host.port ?? 22,
    privateKeyPath: host.authMode === "privateKey" ? (host.privateKeyPath ?? undefined) : undefined,
    proxy: parseProxyUrl(host.proxyUrl),
  };

  if (!existsSync(configPath)) {
    return result;
  }

  const lines = readFileSync(configPath, "utf8").split(/\r?\n/);
  let active = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+#.*$/, "").trim();
    if (!line) {
      continue;
    }

    const [keywordRaw, ...valueParts] = line.split(/\s+/);
    const keyword = keywordRaw?.toLowerCase();
    const value = valueParts.join(" ");

    if (keyword === "host") {
      const patterns = valueParts;
      active = patterns.some((pattern) => hostPatternMatches(pattern, host.sshHost));
      continue;
    }

    if (!active || !value) {
      continue;
    }

    if (keyword === "hostname") {
      result.hostName = value;
    } else if (keyword === "user" && !host.username) {
      result.username = value;
    } else if (keyword === "port" && host.port == null) {
      result.port = Number(value) || result.port;
    } else if (
      keyword === "identityfile" &&
      host.authMode === "privateKey" &&
      !host.privateKeyPath
    ) {
      result.privateKeyPath = value;
    }
  }

  return result;
}

export function sshConnectionKey(
  host: HostWithSecret,
  resolved: ReturnType<typeof resolveSshConfig>,
) {
  const secretFingerprint = createHash("sha256")
    .update(host.authMode)
    .update("\0")
    .update(host.authMode === "password" ? (host.password ?? "") : "")
    .update("\0")
    .update(host.privateKey ?? "")
    .update("\0")
    .update(resolved.privateKeyPath ?? "")
    .digest("hex");

  return [
    resolved.hostName,
    host.username ?? resolved.username ?? "",
    host.port ?? resolved.port,
    resolved.proxy?.raw ?? "",
    host.authMode,
    secretFingerprint,
  ].join("|");
}

export function parseProxyUrl(proxyUrl?: string | null) {
  const raw = proxyUrl?.trim();
  if (!raw) {
    return null;
  }
  const url = new URL(raw);
  if (url.protocol !== "socks5:" && url.protocol !== "socks5h:") {
    throw new Error(`Unsupported SSH proxy protocol: ${url.protocol}`);
  }
  const port = Number(url.port);
  if (!url.hostname || !Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid SSH proxy URL: ${raw}`);
  }
  return {
    raw,
    host: url.hostname,
    port,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

export async function createProxySocket(options: {
  proxy: NonNullable<ReturnType<typeof parseProxyUrl>>;
  targetHost: string;
  targetPort: number;
}) {
  const { socket } = await SocksClient.createConnection({
    command: "connect",
    timeout: 10_000,
    proxy: {
      host: options.proxy.host,
      port: options.proxy.port,
      type: 5,
      userId: options.proxy.username || undefined,
      password: options.proxy.password || undefined,
    },
    destination: {
      host: options.targetHost,
      port: options.targetPort,
    },
  });
  return socket;
}

function hostPatternMatches(pattern: string, host: string) {
  if (pattern.startsWith("!")) {
    return false;
  }
  const expression = `^${pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*")
    .replaceAll("?", ".")}$`;
  return new RegExp(expression).test(host);
}
