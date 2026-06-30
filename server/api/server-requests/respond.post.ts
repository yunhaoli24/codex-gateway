import { readValidatedBody } from "h3";
import { threadBroker } from "../../utils/gateway/runtime/broker";
import {
  defineGatewayEventHandler,
  hostLogContext,
  setGatewayRequestLogContext,
} from "../../utils/gateway/http/errors";
import { requireRecord, serverRequestResponseSchema } from "../../utils/gateway/http/validation";
import { hostStore } from "../../utils/gateway/state/hosts";

export default defineGatewayEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => serverRequestResponseSchema.parse(body));
  const host = requireRecord(hostStore.getWithSecret(input.hostId), "Host not found");
  setGatewayRequestLogContext(event, "server-requests/respond", {
    ...hostLogContext(host),
    threadId: input.threadId,
    requestId: input.requestId,
    hasError: Boolean(input.error),
  });
  await threadBroker.respondToServerRequest(host, input.threadId, {
    requestId: input.requestId,
    result: input.result,
    error: input.error,
  });
  return {};
});
