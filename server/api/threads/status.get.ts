import { getValidatedQuery } from "h3";
import type { ThreadStatusProbeResult } from "~~/shared/types";
import {
  defineGatewayEventHandler,
  hostLogContext,
  setGatewayRequestLogContext,
} from "../../utils/gateway/http/errors";
import { requireRecord, threadStatusSchema } from "../../utils/gateway/http/validation";
import { threadBroker } from "../../utils/gateway/runtime/broker";
import { hostStore } from "../../utils/gateway/state/hosts";

export default defineGatewayEventHandler(async (event): Promise<ThreadStatusProbeResult> => {
  const query = await getValidatedQuery(event, (body) => threadStatusSchema.parse(body));
  const host = requireRecord(hostStore.getWithSecret(query.hostId), "Host not found");
  setGatewayRequestLogContext(event, "threads/status", {
    ...hostLogContext(host),
    threadId: query.threadId,
  });
  return threadBroker.readThreadStatus(host, query.threadId);
});
