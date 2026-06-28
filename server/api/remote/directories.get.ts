import { getValidatedQuery } from "h3";
import { runtimeState } from "../../utils/gateway/runtime-state";
import { hostManager } from "../../utils/gateway/ssh";
import { remoteDirectoryListSchema, requireRecord } from "../../utils/gateway/validation";

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, (body) => remoteDirectoryListSchema.parse(body));
  const host = requireRecord(runtimeState.getHostWithSecret(query.hostId), "Host not found");

  return hostManager.listDirectories(host, query.path);
});
