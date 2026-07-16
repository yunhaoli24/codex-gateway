import { getRouterParam, readValidatedBody } from "h3";
import { sshConnections } from "../../utils/gateway/infra/host-services";
import { defineGatewayConfigMutationHandler } from "../../utils/gateway/http/config-mutation";
import { saveCurrentUserConfig } from "../../utils/gateway/http/errors";
import { requireRecord } from "../../utils/gateway/http/validation/common";
import { hostUpdateSchema } from "../../utils/gateway/http/validation/hosts-projects";
import { hostResourceLifecycle } from "../../utils/gateway/runtime/host-resource-lifecycle";
import { hostRuntimeSupervisor } from "../../utils/gateway/runtime/host-runtime-supervisor";
import { hostStore } from "../../utils/gateway/state/hosts";

export default defineGatewayConfigMutationHandler(async (event) => {
  const id = Number(getRouterParam(event, "id"));
  const userId = event.context.auth!.user.id;
  const input = await readValidatedBody(event, (body) => hostUpdateSchema.parse(body));
  const previous = requireRecord(hostStore.getWithSecret(id), "Host not found");
  const host = requireRecord(hostStore.update(id, input), "Host not found");
  hostResourceLifecycle.changed(userId, previous, host);
  sshConnections.syncHosts(hostStore.listWithSecret());
  hostRuntimeSupervisor.syncCurrentUserConfig();
  saveCurrentUserConfig(event);
  return host;
});
