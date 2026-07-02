import type { RealtimeClientMessage } from "~~/shared/types";
import { requireRecord } from "../../http/validation";
import { threadBroker } from "../../runtime/broker";
import { hostStore } from "../../state/hosts";
import { sendRealtimePeerMessage, type RealtimePeer } from "../peer-state";

export async function setThreadGoal(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "thread.goal.set" }>,
) {
  const host = requireRecord(hostStore.getWithSecret(request.hostId), "Host not found");
  const result = await threadBroker.setThreadGoal(host, request.threadId, {
    ...("objective" in request ? { objective: request.objective } : {}),
    ...("status" in request ? { status: request.status } : {}),
    ...("tokenBudget" in request ? { tokenBudget: request.tokenBudget } : {}),
  });
  sendRealtimePeerMessage(peer, {
    type: "thread.goal.updated",
    requestId: request.requestId,
    hostId: request.hostId,
    threadId: request.threadId,
    goal: (result as any).goal,
  });
}

export async function getThreadGoal(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "thread.goal.get" }>,
) {
  const host = requireRecord(hostStore.getWithSecret(request.hostId), "Host not found");
  const result = await threadBroker.getThreadGoal(host, request.threadId);
  sendRealtimePeerMessage(peer, {
    type: "thread.goal.snapshot",
    requestId: request.requestId,
    hostId: request.hostId,
    threadId: request.threadId,
    goal: (result as any).goal ?? null,
  });
}

export async function clearThreadGoal(
  peer: RealtimePeer,
  request: Extract<RealtimeClientMessage, { type: "thread.goal.clear" }>,
) {
  const host = requireRecord(hostStore.getWithSecret(request.hostId), "Host not found");
  const result = await threadBroker.clearThreadGoal(host, request.threadId);
  sendRealtimePeerMessage(peer, {
    type: "thread.goal.cleared",
    requestId: request.requestId,
    hostId: request.hostId,
    threadId: request.threadId,
    cleared: Boolean((result as any).cleared),
  });
}
