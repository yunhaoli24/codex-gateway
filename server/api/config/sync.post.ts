import { readValidatedBody } from "h3";
import { sshConnections } from "../../utils/gateway/infra/host-services";
import { defineGatewayConfigMutationHandler } from "../../utils/gateway/http/config-mutation";
import { saveCurrentUserConfig } from "../../utils/gateway/http/errors";
import { parseGatewayConfig } from "../../utils/gateway/http/validation/config";
import { hostResourceLifecycle } from "../../utils/gateway/runtime/host-resource-lifecycle";
import { hostRuntimeFingerprint } from "../../utils/gateway/runtime/host-runtime-fingerprint";
import { hostRuntimeSupervisor } from "../../utils/gateway/runtime/host-runtime-supervisor";
import { hostStore } from "../../utils/gateway/state/hosts";
import type { StoredHostRecord } from "../../utils/gateway/state/memory";
import { runtimeConfigStore } from "../../utils/gateway/state/runtime-config";

export default defineGatewayConfigMutationHandler(async (event) => {
  const previousHosts = hostStore.listWithSecret();
  const userId = event.context.auth!.user.id;
  const config = await readValidatedBody(event, parseGatewayConfig);
  runtimeConfigStore.replace(config);
  const nextHosts = hostStore.listWithSecret();
  const nextById = new Map(nextHosts.map((host) => [host.id, host]));
  for (const previous of previousHosts) {
    const next = nextById.get(previous.id);
    if (!next) {
      hostResourceLifecycle.deleted(userId, previous.id);
    } else if (hostRuntimeFingerprint(previous) !== hostRuntimeFingerprint(next)) {
      hostResourceLifecycle.changed(userId, previous, next);
    }
  }
  if (hostRuntimeChanged(previousHosts, nextHosts)) {
    sshConnections.syncHosts(nextHosts);
    hostRuntimeSupervisor.syncCurrentUserConfig();
  }
  saveCurrentUserConfig(event);
  return runtimeConfigStore.export();
});

function hostRuntimeChanged(previousHosts: StoredHostRecord[], nextHosts: StoredHostRecord[]) {
  const previousById = new Map(previousHosts.map((host) => [host.id, host]));
  const nextById = new Map(nextHosts.map((host) => [host.id, host]));
  if (previousById.size !== nextById.size) {
    return true;
  }
  for (const previous of previousHosts) {
    const next = nextById.get(previous.id);
    if (!next || hostRuntimeFingerprint(previous) !== hostRuntimeFingerprint(next)) {
      return true;
    }
  }
  return false;
}
