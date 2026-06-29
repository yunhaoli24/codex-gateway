import { readValidatedBody } from "h3";
import { threadBroker } from "../../utils/gateway/runtime/broker";
import { requireRecord, threadOpenSchema } from "../../utils/gateway/http/validation";
import { hostLogContext, setGatewayRequestLogContext } from "../../utils/gateway/http/errors";
import { hostStore } from "../../utils/gateway/state/hosts";

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => threadOpenSchema.parse(body));
  const host = requireRecord(hostStore.getWithSecret(input.hostId), "Host not found");
  setGatewayRequestLogContext(event, "threads/open", {
    ...hostLogContext(host),
    threadId: input.threadId,
    projectId: input.projectId ?? null,
    limit: input.limit,
  });
  return threadBroker.openThread(host, input.threadId, input.projectId ?? null, input.limit);
});
