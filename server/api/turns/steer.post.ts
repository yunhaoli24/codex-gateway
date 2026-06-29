import { readValidatedBody } from "h3";
import { threadBroker } from "../../utils/gateway/runtime/broker";
import { requireRecord, turnSteerSchema } from "../../utils/gateway/http/validation";
import { hostLogContext, setGatewayRequestLogContext } from "../../utils/gateway/http/errors";
import { hostStore } from "../../utils/gateway/state/hosts";

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => turnSteerSchema.parse(body));
  const host = requireRecord(hostStore.getWithSecret(input.hostId), "Host not found");
  setGatewayRequestLogContext(event, "turns/steer", {
    ...hostLogContext(host),
    threadId: input.threadId,
    expectedTurnId: input.expectedTurnId,
    clientUserMessageId: input.clientUserMessageId ?? null,
    textLength: input.text.length,
    imageCount: input.images.length,
  });
  return threadBroker.steerTurn(host, input.threadId, {
    text: input.text,
    expectedTurnId: input.expectedTurnId,
    clientUserMessageId: input.clientUserMessageId,
    images: input.images,
  });
});
