import type { RealtimeClientMessage } from "~~/shared/types";

type RealtimeRequestMessage = Extract<RealtimeClientMessage, { requestId: string }>;

export class RealtimeRequestError extends Error {
  constructor(
    message: string,
    readonly request: RealtimeRequestMessage | undefined,
    readonly reason: "timeout" | "unavailable" | "disconnected" | "server",
    readonly details: Record<string, unknown> = {},
  ) {
    super(formatRealtimeRequestError(message, request, details));
    this.name = "RealtimeRequestError";
  }
}

export function realtimeRequestErrorFromServer(
  message: string,
  request: RealtimeRequestMessage | undefined,
  details: Record<string, unknown> = {},
) {
  return new RealtimeRequestError(message, request, "server", details);
}

function formatRealtimeRequestError(
  message: string,
  request: RealtimeRequestMessage | undefined,
  details: Record<string, unknown>,
) {
  const lines = [message];
  const context = [
    request?.type ? `type=${request.type}` : null,
    request && "hostId" in request ? `hostId=${request.hostId}` : null,
    request && "threadId" in request ? `threadId=${request.threadId}` : null,
    request?.requestId ? `requestId=${request.requestId}` : null,
    typeof details.timeoutMs === "number" ? `timeoutMs=${details.timeoutMs}` : null,
    typeof details.serverRequestId === "string" || typeof details.serverRequestId === "number"
      ? `serverRequestId=${details.serverRequestId}`
      : null,
  ].filter(Boolean);
  if (context.length) {
    lines.push(context.join(" · "));
  }
  return lines.join("\n");
}
