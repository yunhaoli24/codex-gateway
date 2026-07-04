import type { Page } from "@playwright/test";
import type { RealtimeClientMessage, RealtimeServerMessage } from "../../../shared/types";

export async function sendRealtimeRequest<T extends RealtimeServerMessage = RealtimeServerMessage>(
  page: Page,
  message: Extract<RealtimeClientMessage, { requestId: string }>,
) {
  const response = await sendRealtimeRawRequest(page, message);
  if (response.type === "error") {
    throw new Error(response.message || "Realtime request failed");
  }
  return response as T;
}

export async function sendRealtimeRawRequest<
  T extends RealtimeServerMessage = RealtimeServerMessage,
>(page: Page, message: Extract<RealtimeClientMessage, { requestId: string }>) {
  return (await page.evaluate(async (message) => {
    const token = localStorage.getItem("codex-gateway-auth-token");
    if (!token) {
      throw new Error("Missing E2E auth token");
    }
    const url = new URL("/api/realtime", window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url);
    const received: any[] = [];
    return await new Promise<any>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        socket.close();
        reject(
          new Error(
            `Timed out waiting for realtime response ${message.requestId}: ${JSON.stringify(received)}`,
          ),
        );
      }, 30_000);
      socket.addEventListener("open", () => {
        socket.send(JSON.stringify({ type: "auth.authenticate", token }));
      });
      socket.addEventListener("message", (event) => {
        const parsed = JSON.parse(String(event.data));
        received.push(parsed);
        if (parsed.type === "ready") {
          socket.send(JSON.stringify(message));
          return;
        }
        if (parsed.requestId !== message.requestId) {
          return;
        }
        window.clearTimeout(timer);
        socket.close();
        resolve(parsed);
      });
      socket.addEventListener("error", () => {
        window.clearTimeout(timer);
        reject(new Error("Realtime socket failed"));
      });
      socket.addEventListener("close", (event) => {
        if (!event.wasClean && !received.some((item) => item.requestId === message.requestId)) {
          window.clearTimeout(timer);
          reject(new Error(`Realtime socket closed: ${event.code} ${event.reason}`));
        }
      });
    });
  }, message)) as T;
}
