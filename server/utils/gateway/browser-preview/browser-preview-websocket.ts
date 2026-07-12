import WebSocket, { type RawData } from "ws";
import type { Peer, Message } from "crossws";
import { browserPreviewManager } from "./browser-preview-manager";
import { openBrowserPreviewUpstreamSocket, readPreviewCookie } from "./browser-preview-proxy";

interface BrowserPreviewPeerContext {
  upstream?: WebSocket;
  pending: Array<string | Uint8Array>;
}

export async function openBrowserPreviewWebSocket(peer: Peer) {
  const request = peer.request;
  const requestUrl = browserPreviewWebSocketUrl(request);
  const hostname = requestUrl.hostname.toLowerCase();
  const session = browserPreviewManager.resolveWebSocket(
    hostname,
    readPreviewCookie(request.headers.get("cookie") ?? undefined),
  );
  if (!session) {
    peer.close(1008, "Browser preview session expired");
    return;
  }

  console.info("[browser-preview] websocket opening", {
    sessionId: session.sessionId,
    target: session.target.origin,
    path: requestUrl.pathname,
  });

  const socket = await openBrowserPreviewUpstreamSocket(session);
  const protocols = request.headers
    .get("sec-websocket-protocol")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const targetProtocol = session.target.protocol === "https:" ? "wss:" : "ws:";
  const upstreamUrl = `${targetProtocol}//${session.target.host}${requestUrl.pathname}${requestUrl.search}`;
  const upstream = new WebSocket(upstreamUrl, protocols, {
    createConnection: () => socket as never,
    headers: websocketHeaders(session.target.origin, request.headers),
  });
  const context = previewPeerContext(peer);
  context.upstream = upstream;
  upstream.on("open", () => {
    console.info("[browser-preview] websocket upstream connected", {
      sessionId: session.sessionId,
    });
    for (const message of context.pending) upstream.send(message);
    context.pending = [];
  });
  upstream.on("message", (data: RawData, isBinary) =>
    peer.send(isBinary ? data : rawDataText(data)),
  );
  upstream.on("close", (code, reason) => peer.close(code, reason.toString()));
  upstream.on("error", (error) => {
    console.error("[browser-preview] websocket upstream failed", {
      sessionId: session.sessionId,
      message: error.message,
    });
    peer.close(1011, "Remote WebSocket failed");
  });
}

export function browserPreviewWebSocketUrl(request: { url: string; headers: Headers }) {
  const headerHost = request.headers.get("host") ?? "preview.invalid";
  const requestUrl = new URL(request.url, `http://${headerHost}`);
  const forwardedPath =
    request.headers.get("x-browser-preview-path") ?? requestUrl.searchParams.get("path");
  return forwardedPath ? new URL(forwardedPath, `http://${headerHost}`) : requestUrl;
}

export function forwardBrowserPreviewWebSocketMessage(peer: Peer, message: Message) {
  const context = previewPeerContext(peer);
  const data = typeof message.rawData === "string" ? message.rawData : message.uint8Array();
  if (context.upstream?.readyState === WebSocket.OPEN) context.upstream.send(data);
  else context.pending.push(data);
}

export function closeBrowserPreviewWebSocket(peer: Peer) {
  const context = previewPeerContext(peer);
  context.pending = [];
  context.upstream?.close();
  context.upstream = undefined;
}

function previewPeerContext(peer: Peer) {
  let context = peer.context.browserPreview as BrowserPreviewPeerContext | undefined;
  if (!context) {
    context = { pending: [] };
    peer.context.browserPreview = context;
  }
  return context;
}

function websocketHeaders(targetOrigin: string, incoming: Headers) {
  const headers: Record<string, string> = {};
  const cookie = incoming
    .get("cookie")
    ?.split(";")
    .map((value) => value.trim())
    .filter((value) => !/^(__Host-)?gateway-preview=/.test(value))
    .join("; ");
  if (cookie) headers.cookie = cookie;
  headers.origin = targetOrigin;
  const userAgent = incoming.get("user-agent");
  if (userAgent) headers["user-agent"] = userAgent;
  return headers;
}

function rawDataText(data: RawData) {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return data.toString("utf8");
}
