import { getValidatedQuery } from "h3";
import { threadBroker } from "../../utils/gateway/runtime/broker";
import { defineGatewayEventHandler } from "../../utils/gateway/http/errors";
import { requireRecord, threadTurnsListSchema } from "../../utils/gateway/http/validation";
import { hostStore } from "../../utils/gateway/state/hosts";

export default defineGatewayEventHandler(async (event) => {
  const query = await getValidatedQuery(event, (body) => threadTurnsListSchema.parse(body));
  const host = requireRecord(hostStore.getWithSecret(query.hostId), "Host not found");
  return threadBroker.listThreadTurns(host, query.threadId, {
    cursor: query.cursor ?? null,
    limit: query.limit,
    sortDirection: query.sortDirection,
  });
});
