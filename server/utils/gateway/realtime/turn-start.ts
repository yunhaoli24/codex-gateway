import type { RealtimeClientMessage } from "~~/shared/types";
import { requireRecord, turnStartSchema } from "../http/validation";
import { threadBroker } from "../runtime/broker";
import { hostStore } from "../state/hosts";

export type RealtimeTurnStartMessage = Extract<RealtimeClientMessage, { type: "turn.start" }>;

export async function startTurnFromRealtime(message: RealtimeTurnStartMessage) {
  const input = turnStartSchema.parse(message);
  const host = requireRecord(hostStore.getWithSecret(input.hostId), "Host not found");
  return threadBroker.startTurn(host, input.threadId, {
    text: input.text,
    cwd: input.cwd,
    clientUserMessageId: input.clientUserMessageId,
    model: input.model,
    effort: input.effort,
    approvalPolicy: input.approvalPolicy,
    collaborationMode: input.collaborationMode,
    images: input.images,
    files: input.files,
  });
}
