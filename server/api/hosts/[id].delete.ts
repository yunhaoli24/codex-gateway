import { getRouterParam } from "h3";
import { sshConnections } from "../../utils/gateway/infra/host-services";
import { defineGatewayConfigMutationHandler } from "../../utils/gateway/http/config-mutation";
import { saveCurrentUserConfig } from "../../utils/gateway/http/errors";
import { hostResourceLifecycle } from "../../utils/gateway/runtime/host-resource-lifecycle";
import { hostRuntimeSupervisor } from "../../utils/gateway/runtime/host-runtime-supervisor";
import { hostStore } from "../../utils/gateway/state/hosts";

export default defineGatewayConfigMutationHandler((event) => {
  const id = Number(getRouterParam(event, "id"));
  const userId = event.context.auth!.user.id;
  hostStore.delete(id);
  hostResourceLifecycle.deleted(userId, id);
  sshConnections.syncHosts(hostStore.listWithSecret());
  hostRuntimeSupervisor.syncCurrentUserConfig();
  saveCurrentUserConfig(event);
  return { ok: true };
});
