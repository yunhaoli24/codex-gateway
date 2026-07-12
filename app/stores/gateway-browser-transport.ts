import type { BrowserPreviewSessionSnapshot, BrowserPreviewTarget } from "~~/shared/types";
import { useGatewayBrowserStore } from "./gateway-browser";
import { useGatewayRealtimeStore } from "./gateway-realtime";

export async function openBrowserPreview(input: BrowserPreviewTarget) {
  const response = await useGatewayRealtimeStore().request<{
    session: BrowserPreviewSessionSnapshot;
  }>((requestId) => ({ type: "browser.open", requestId, ...input }), 30_000);
  useGatewayBrowserStore().upsertSession(response.session);
  return response.session;
}

export async function closeBrowserPreview(sessionId: string) {
  useGatewayBrowserStore().removeSession(sessionId);
  await useGatewayRealtimeStore()
    .request((requestId) => ({ type: "browser.close", requestId, sessionId }))
    .catch(() => null);
}

export async function setBrowserPreviewInsecureTls(sessionId: string, allowInsecureTls: boolean) {
  const response = await useGatewayRealtimeStore().request<{
    session: BrowserPreviewSessionSnapshot;
  }>((requestId) => ({
    type: "browser.allowInsecureTls",
    requestId,
    sessionId,
    allowInsecureTls,
  }));
  useGatewayBrowserStore().upsertSession(response.session);
  return response.session;
}
