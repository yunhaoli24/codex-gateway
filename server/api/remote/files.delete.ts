import { getValidatedQuery } from "h3";
import {
  defineGatewayEventHandler,
  hostLogContext,
  setGatewayRequestLogContext,
} from "../../utils/gateway/http/errors";
import { requireRecord } from "../../utils/gateway/http/validation/common";
import { remoteFileSchema } from "../../utils/gateway/http/validation/remote";
import { remoteFiles } from "../../utils/gateway/infra/host-services";
import { hostStore } from "../../utils/gateway/state/hosts";

export default defineGatewayEventHandler(async (event) => {
  const query = await getValidatedQuery(event, (body) => remoteFileSchema.parse(body));
  const host = requireRecord(hostStore.getWithSecret(query.hostId), "Host not found");
  setGatewayRequestLogContext(event, "remote/files.delete", {
    ...hostLogContext(host),
    path: query.path,
  });

  await remoteFiles.deleteFile(host, query.path);
  return { deleted: true as const };
});
