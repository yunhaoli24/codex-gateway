import type { RealtimeClientMessage } from "~~/shared/types";
import { requireRecord } from "../http/validation/common";
import { turnSteerSchema } from "../http/validation/threads";
import { threadBroker } from "../runtime/broker";
import { hostStore } from "../state/hosts";
import {
  fileReferencesAdditionalContext,
  validateProjectFileReferences,
} from "../project-files/project-file-references";

export type RealtimeTurnSteerMessage = Extract<RealtimeClientMessage, { type: "turn.steer" }>;

export async function steerTurnFromRealtime(message: RealtimeTurnSteerMessage) {
  const input = turnSteerSchema.parse(message);
  const host = requireRecord(hostStore.getWithSecret(input.hostId), "Host not found");
  const references = await validateProjectFileReferences(host, input.threadId, input.references);
  return threadBroker.steerTurn(host, input.threadId, {
    text: input.text,
    expectedTurnId: input.expectedTurnId,
    clientUserMessageId: input.clientUserMessageId,
    images: input.images,
    files: input.files,
    additionalContext: fileReferencesAdditionalContext(references),
  });
}
