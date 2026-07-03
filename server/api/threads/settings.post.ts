import { readValidatedBody } from "h3";
import { threadBroker } from "../../utils/gateway/runtime/broker";
import { defineGatewayEventHandler } from "../../utils/gateway/http/errors";
import { requireRecord } from "../../utils/gateway/http/validation/common";
import { threadSettingsUpdateSchema } from "../../utils/gateway/http/validation/threads";
import { hostStore } from "../../utils/gateway/state/hosts";

export default defineGatewayEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => threadSettingsUpdateSchema.parse(body));
  const host = requireRecord(hostStore.getWithSecret(input.hostId), "Host not found");
  return threadBroker.updateThreadSettings(host, input.threadId, {
    model: input.model,
    effort: input.effort,
    approvalPolicy: input.approvalPolicy,
  });
});
