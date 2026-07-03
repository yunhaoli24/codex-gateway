import { getRouterParam, readValidatedBody } from "h3";
import { sshConnections } from "../../utils/gateway/infra/host-services";
import { defineGatewayEventHandler, saveCurrentUserConfig } from "../../utils/gateway/http/errors";
import { requireRecord } from "../../utils/gateway/http/validation/common";
import { hostUpdateSchema } from "../../utils/gateway/http/validation/hosts-projects";
import { threadBroker } from "../../utils/gateway/runtime/broker";
import { hostRuntimeSupervisor } from "../../utils/gateway/runtime/host-runtime-supervisor";
import { hostStore } from "../../utils/gateway/state/hosts";

export default defineGatewayEventHandler(async (event) => {
  const id = Number(getRouterParam(event, "id"));
  const input = await readValidatedBody(event, (body) => hostUpdateSchema.parse(body));
  const host = requireRecord(hostStore.update(id, input), "Host not found");
  threadBroker.closeHost(id);
  sshConnections.syncHosts(hostStore.listWithSecret());
  hostRuntimeSupervisor.syncCurrentUserConfig();
  saveCurrentUserConfig(event);
  return host;
});
