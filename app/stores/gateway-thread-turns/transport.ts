import type { ComposerTurnOptions } from "~~/shared/types";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import {
  expectThreadTimelinePage,
  expectTurnInterruptAccepted,
  expectTurnStartAccepted,
  expectTurnSteerAccepted,
} from "@/stores/gateway-realtime/response-parsers";

export function requestTurnStart(input: {
  hostId: number;
  threadId: string;
  projectId: number;
  text: string;
  clientUserMessageId: string;
  cwd: string | null;
  options: ComposerTurnOptions;
}) {
  return useGatewayRealtimeStore().request(
    (requestId) => ({
      type: "turn.start",
      requestId,
      hostId: input.hostId,
      threadId: input.threadId,
      projectId: input.projectId,
      text: input.text,
      clientUserMessageId: input.clientUserMessageId,
      cwd: input.cwd ?? undefined,
      model: input.options.model === "" ? undefined : input.options.model,
      effort: input.options.effort === "" ? undefined : input.options.effort,
      summary: input.options.summary,
      approvalPolicy: input.options.approvalPolicy ?? undefined,
      collaborationMode: input.options.collaborationMode ?? undefined,
      images: input.options.images ?? [],
      files: input.options.files ?? [],
      references: input.options.references ?? [],
    }),
    expectTurnStartAccepted,
  );
}

export function requestThreadTimelinePage(input: {
  hostId: number;
  threadId: string;
  cursor: string | null;
  limit?: number;
}) {
  return useGatewayRealtimeStore().request(
    (requestId) => ({
      type: "thread.timeline.load",
      requestId,
      hostId: input.hostId,
      threadId: input.threadId,
      cursor: input.cursor,
      limit: input.limit,
    }),
    expectThreadTimelinePage,
  );
}

export function requestTurnSteer(input: {
  hostId: number;
  threadId: string;
  projectId: number;
  expectedTurnId: string;
  text: string;
  clientUserMessageId: string;
  options: ComposerTurnOptions;
}) {
  return useGatewayRealtimeStore().request(
    (requestId) => ({
      type: "turn.steer",
      requestId,
      hostId: input.hostId,
      threadId: input.threadId,
      projectId: input.projectId,
      expectedTurnId: input.expectedTurnId,
      text: input.text,
      clientUserMessageId: input.clientUserMessageId,
      images: input.options.images ?? [],
      references: input.options.references ?? [],
    }),
    expectTurnSteerAccepted,
  );
}

export function requestTurnInterrupt(hostId: number, threadId: string, turnId: string) {
  return useGatewayRealtimeStore().request(
    (requestId) => ({
      type: "turn.interrupt",
      requestId,
      hostId,
      threadId,
      turnId,
    }),
    expectTurnInterruptAccepted,
  );
}

export function respondToServerRequest(
  hostId: number,
  threadId: string,
  serverRequestId: string | number,
  result: unknown,
) {
  return useGatewayRealtimeStore().request(
    (requestId) => ({
      type: "serverRequest.respond",
      requestId,
      hostId,
      threadId,
      serverRequestId,
      result,
    }),
    { errorMode: "notify" },
  );
}
