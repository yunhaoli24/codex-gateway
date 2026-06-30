import { readValidatedBody } from "h3";
import { threadBroker } from "../../utils/gateway/runtime/broker";
import { defineGatewayEventHandler } from "../../utils/gateway/http/errors";
import { requireRecord, threadStartSchema } from "../../utils/gateway/http/validation";
import { hostStore } from "../../utils/gateway/state/hosts";

export default defineGatewayEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => threadStartSchema.parse(body));
  const host = requireRecord(hostStore.getWithSecret(input.hostId), "Host not found");
  return threadBroker.startThread(
    host,
    {
      cwd: input.cwd || undefined,
      model: input.model || undefined,
      effort: input.effort || undefined,
      approvalPolicy: input.approvalPolicy || undefined,
    },
    input.projectId ?? null,
  );
});
