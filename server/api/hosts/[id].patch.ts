import { getRouterParam, readValidatedBody } from "h3";
import { sshConnections } from "../../utils/gateway/infra/host-services";
import { hostUpdateSchema, requireRecord } from "../../utils/gateway/http/validation";
import { threadBroker } from "../../utils/gateway/runtime/broker";
import { hostStore } from "../../utils/gateway/state/hosts";

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, "id"));
  const input = await readValidatedBody(event, (body) => hostUpdateSchema.parse(body));
  const host = requireRecord(hostStore.update(id, input), "Host not found");
  threadBroker.closeHost(id);
  sshConnections.syncHosts(hostStore.listWithSecret());
  return host;
});
