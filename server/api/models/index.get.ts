import { getValidatedQuery } from "h3";
import { threadBroker } from "../../utils/gateway/runtime/broker";
import {
  defineGatewayEventHandler,
  hostLogContext,
  setGatewayRequestLogContext,
} from "../../utils/gateway/http/errors";
import { modelListSchema, requireRecord } from "../../utils/gateway/http/validation";
import { hostStore } from "../../utils/gateway/state/hosts";

export default defineGatewayEventHandler(async (event) => {
  const query = await getValidatedQuery(event, (body) => modelListSchema.parse(body));
  const host = requireRecord(hostStore.getWithSecret(query.hostId), "Host not found");
  setGatewayRequestLogContext(event, "models/list", {
    ...hostLogContext(host),
    includeHidden: query.includeHidden ?? false,
    limit: query.limit,
    cursor: query.cursor ?? null,
  });

  return threadBroker.listModels(host, {
    includeHidden: query.includeHidden ?? false,
    limit: query.limit,
    cursor: query.cursor ?? null,
  });
});
