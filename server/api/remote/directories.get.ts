import { getValidatedQuery } from "h3";
import { remoteFiles } from "../../utils/gateway/infra/host-services";
import {
  defineGatewayEventHandler,
  hostLogContext,
  setGatewayRequestLogContext,
} from "../../utils/gateway/http/errors";
import { remoteDirectoryListSchema, requireRecord } from "../../utils/gateway/http/validation";
import { hostStore } from "../../utils/gateway/state/hosts";

export default defineGatewayEventHandler(async (event) => {
  const query = await getValidatedQuery(event, (body) => remoteDirectoryListSchema.parse(body));
  const host = requireRecord(hostStore.getWithSecret(query.hostId), "Host not found");
  setGatewayRequestLogContext(event, "remote/directories", {
    ...hostLogContext(host),
    path: query.path,
  });

  return remoteFiles.listDirectories(host, query.path);
});
