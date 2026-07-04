import type { ComposerTurnOptions, ThreadTurnsPageResult } from "~~/shared/types";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";

export function requestTurnStart(input: {
  hostId: number;
  threadId: string;
  text: string;
  clientUserMessageId: string;
  cwd: string | null;
  options: ComposerTurnOptions;
}) {
  return useGatewayRealtimeStore().request<{ type: "turn.start.accepted"; turn?: any }>(
    (requestId) => ({
      type: "turn.start",
      requestId,
      hostId: input.hostId,
      threadId: input.threadId,
      text: input.text,
      clientUserMessageId: input.clientUserMessageId,
      cwd: input.cwd ?? undefined,
      model: input.options.model || undefined,
      effort: input.options.effort || undefined,
      approvalPolicy: input.options.approvalPolicy || undefined,
      collaborationMode: input.options.collaborationMode || undefined,
      images: input.options.images ?? [],
      files: input.options.files ?? [],
    }),
  );
}

export function requestTurnSteer(input: {
  hostId: number;
  threadId: string;
  expectedTurnId: string;
  text: string;
  clientUserMessageId: string;
  options: ComposerTurnOptions;
}) {
  return useGatewayRealtimeStore().request<{ type: "turn.steer.accepted"; turnId?: string }>(
    (requestId) => ({
      type: "turn.steer",
      requestId,
      hostId: input.hostId,
      threadId: input.threadId,
      expectedTurnId: input.expectedTurnId,
      text: input.text,
      clientUserMessageId: input.clientUserMessageId,
      images: input.options.images ?? [],
    }),
  );
}

export function requestTurnInterrupt(hostId: number, threadId: string, turnId: string) {
  return useGatewayRealtimeStore().request<{ type: "turn.interrupt.accepted" }>((requestId) => ({
    type: "turn.interrupt",
    requestId,
    hostId,
    threadId,
    turnId,
  }));
}

export function respondToServerRequest(
  hostId: number,
  threadId: string,
  serverRequestId: string | number,
  result: unknown,
) {
  return useGatewayRealtimeStore().request((requestId) => ({
    type: "serverRequest.respond",
    requestId,
    hostId,
    threadId,
    serverRequestId,
    result,
  }));
}

export function requestThreadTurnsPage(input: {
  hostId: number;
  threadId: string;
  cursor: string;
  limit: number;
  sortDirection: "asc" | "desc";
}) {
  return useGatewayRealtimeStore().request<
    { type: "thread.turns.page"; hostId: number; threadId: string } & ThreadTurnsPageResult
  >((requestId) => ({
    type: "thread.turns.load",
    requestId,
    hostId: input.hostId,
    threadId: input.threadId,
    cursor: input.cursor,
    limit: input.limit,
    sortDirection: input.sortDirection,
  }));
}
