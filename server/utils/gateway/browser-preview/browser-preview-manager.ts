import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { Duplex } from "node:stream";
import type {
  BrowserPreviewSessionSnapshot,
  BrowserPreviewTarget,
  HostRecord,
} from "~~/shared/types";

const TICKET_TTL_MS = 60_000;

export interface BrowserPreviewSession {
  sessionId: string;
  ownerId: string;
  userId: number;
  host: HostRecord;
  target: URL;
  targetConfig: BrowserPreviewTarget;
  previewOrigin: string;
  cookieToken: string;
  ticket: string;
  ticketExpiresAt: number;
  status: "open" | "closed";
  sockets: Set<Duplex>;
}

export class BrowserPreviewManager {
  private sessions = new Map<string, BrowserPreviewSession>();
  private sessionsByCookie = new Map<string, BrowserPreviewSession>();
  private tickets = new Map<string, BrowserPreviewSession>();

  open(ownerId: string, userId: number, host: HostRecord, input: BrowserPreviewTarget) {
    const target = normalizeTarget(input.targetUrl);
    const sessionId = randomUUID();
    const ticket = randomBytes(32).toString("base64url");
    const cookieToken = randomBytes(32).toString("base64url");
    const previewOrigin = previewOriginFor(userId, host.id, target);
    const session: BrowserPreviewSession = {
      sessionId,
      ownerId,
      userId,
      host,
      target,
      targetConfig: { ...input, targetUrl: target.href },
      previewOrigin,
      cookieToken,
      ticket,
      ticketExpiresAt: Date.now() + TICKET_TTL_MS,
      status: "open",
      sockets: new Set(),
    };
    this.sessions.set(sessionId, session);
    this.tickets.set(ticket, session);
    return this.snapshot(session);
  }

  exchangeTicket(hostname: string, ticket: string) {
    const session = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    if (!session || session.status !== "open" || session.ticketExpiresAt < Date.now()) return null;
    if (new URL(session.previewOrigin).hostname !== hostname) return null;
    this.sessionsByCookie.set(session.cookieToken, session);
    return { cookieToken: session.cookieToken, path: initialPath(session.target) };
  }

  resolve(hostname: string, cookieToken: string | undefined) {
    if (!cookieToken) return null;
    const session = this.sessionsByCookie.get(cookieToken);
    if (!session || session.status !== "open") return null;
    return new URL(session.previewOrigin).hostname === hostname ? session : null;
  }

  resolveWebSocket(hostname: string, cookieToken: string | undefined) {
    return this.resolve(hostname, cookieToken);
  }

  setInsecureTls(userId: number, sessionId: string, allowInsecureTls: boolean) {
    const session = this.require(userId, sessionId);
    session.targetConfig.allowInsecureTls = allowInsecureTls;
    return this.snapshot(session);
  }

  trackSocket(session: BrowserPreviewSession, socket: Duplex) {
    session.sockets.add(socket);
    socket.once("close", () => session.sockets.delete(socket));
  }

  close(userId: number, sessionId: string) {
    this.closeSession(this.require(userId, sessionId));
  }

  closeOwner(ownerId: string) {
    for (const session of this.sessions.values()) {
      if (session.ownerId === ownerId) this.closeSession(session);
    }
  }

  closeHost(userId: number, hostId: number) {
    for (const session of this.sessions.values()) {
      if (session.userId === userId && session.host.id === hostId) this.closeSession(session);
    }
  }

  private closeSession(session: BrowserPreviewSession) {
    if (session.status === "closed") return;
    session.status = "closed";
    this.sessions.delete(session.sessionId);
    this.sessionsByCookie.delete(session.cookieToken);
    this.tickets.delete(session.ticket);
    for (const socket of session.sockets) socket.destroy();
    session.sockets.clear();
  }

  private require(userId: number, sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId || session.status !== "open") {
      throw new Error("Browser preview session not found");
    }
    return session;
  }

  private snapshot(session: BrowserPreviewSession): BrowserPreviewSessionSnapshot {
    return {
      ...session.targetConfig,
      sessionId: session.sessionId,
      previewOrigin: session.previewOrigin,
      bootstrapUrl: `${session.previewOrigin}/_gateway/preview/bootstrap#${session.ticket}`,
      status: session.status,
    };
  }
}

export const browserPreviewManager = new BrowserPreviewManager();
export type ActiveBrowserPreviewSession = NonNullable<ReturnType<BrowserPreviewManager["resolve"]>>;

function normalizeTarget(value: string) {
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `http://${value}`;
  const target = new URL(withProtocol);
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("Browser preview supports only HTTP and HTTPS URLs");
  }
  target.username = "";
  target.password = "";
  return target;
}

function previewHostname(userId: number, hostId: number, target: URL) {
  const secret =
    process.env.BROWSER_PREVIEW_SECRET ||
    process.env.CODEX_GATEWAY_CONFIG_SECRET ||
    process.env.NUXT_SESSION_PASSWORD;
  if (!secret) throw new Error("Browser preview secret is not configured");
  const digest = createHmac("sha256", secret)
    .update(`${userId}:${hostId}:${target.origin}`)
    .digest("hex")
    .slice(0, 32);
  const domain = process.env.BROWSER_PREVIEW_DOMAIN || "cloudawn.top";
  return `p-${digest}.${domain}`;
}

export function isBrowserPreviewHostname(hostname: string) {
  const domain = process.env.BROWSER_PREVIEW_DOMAIN || "cloudawn.top";
  return new RegExp(`^p-[0-9a-f]{32}\\.${escapeRegExp(domain)}$`, "i").test(hostname);
}

function previewOriginFor(userId: number, hostId: number, target: URL) {
  const scheme = process.env.BROWSER_PREVIEW_SCHEME || "https";
  const port = process.env.BROWSER_PREVIEW_PUBLIC_PORT;
  return `${scheme}://${previewHostname(userId, hostId, target)}${port ? `:${port}` : ""}`;
}

function initialPath(target: URL) {
  return `${target.pathname}${target.search}${target.hash}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
