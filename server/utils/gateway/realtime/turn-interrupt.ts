import type { RealtimeClientMessage } from "~~/shared/types";
import { requireRecord, turnInterruptSchema } from "../http/validation";
import { threadBroker } from "../runtime/broker";
import { hostStore } from "../state/hosts";

export type RealtimeTurnInterruptMessage = Extract<
  RealtimeClientMessage,
  { type: "turn.interrupt" }
>;

export async function interruptTurnFromRealtime(message: RealtimeTurnInterruptMessage) {
  const input = turnInterruptSchema.parse(message);
  const host = requireRecord(hostStore.getWithSecret(input.hostId), "Host not found");
  return threadBroker.interruptTurn(host, input.threadId, input.turnId);
}
