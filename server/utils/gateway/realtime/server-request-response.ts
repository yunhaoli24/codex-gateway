import type { RealtimeClientMessage } from "~~/shared/types";
import { requireRecord, serverRequestResponseSchema } from "../http/validation";
import { threadBroker } from "../runtime/broker";
import { hostStore } from "../state/hosts";

export type RealtimeServerRequestResponseMessage = Extract<
  RealtimeClientMessage,
  { type: "serverRequest.respond" }
>;

export async function respondToServerRequestFromRealtime(
  message: RealtimeServerRequestResponseMessage,
) {
  const input = serverRequestResponseSchema.parse({
    ...message,
    requestId: message.serverRequestId,
  });
  const host = requireRecord(hostStore.getWithSecret(input.hostId), "Host not found");
  await threadBroker.respondToServerRequest(host, input.threadId, {
    requestId: input.requestId,
    result: input.result,
    error: input.error,
  });
}
