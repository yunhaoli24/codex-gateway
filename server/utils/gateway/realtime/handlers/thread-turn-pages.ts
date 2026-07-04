import type { RealtimeClientMessage } from "~~/shared/types";
import { requireRecord } from "../../http/validation/common";
import { threadTurnsListSchema } from "../../http/validation/threads";
import { threadBroker } from "../../runtime/broker";
import { hostStore } from "../../state/hosts";
import { sendRealtimePeerMessage, type RealtimePeer } from "../peer-state";

export async function loadThreadTurns(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "thread.turns.load" }>,
) {
  const input = threadTurnsListSchema.parse(request);
  const host = requireRecord(hostStore.getWithSecret(input.hostId), "Host not found");
  const result = await threadBroker.listThreadTurns(host, input.threadId, {
    cursor: input.cursor ?? null,
    limit: input.limit,
    sortDirection: input.sortDirection,
  });
  sendRealtimePeerMessage(peer, {
    type: "thread.turns.page",
    requestId: request.requestId,
    hostId: input.hostId,
    threadId: input.threadId,
    ...result,
  });
}
