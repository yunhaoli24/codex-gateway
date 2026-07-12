import { readValidatedBody } from "h3";
import { sshConnections } from "../../utils/gateway/infra/host-services";
import { defineGatewayConfigMutationHandler } from "../../utils/gateway/http/config-mutation";
import { saveCurrentUserConfig } from "../../utils/gateway/http/errors";
import { parseGatewayConfig } from "../../utils/gateway/http/validation/config";
import { threadBroker } from "../../utils/gateway/runtime/broker";
import { hostRuntimeSupervisor } from "../../utils/gateway/runtime/host-runtime-supervisor";
import { hostStore } from "../../utils/gateway/state/hosts";
import type { StoredHostRecord } from "../../utils/gateway/state/memory";
import { runtimeConfigStore } from "../../utils/gateway/state/runtime-config";
import { terminalManager } from "../../utils/gateway/terminal/terminal-manager";
import { browserPreviewManager } from "../../utils/gateway/browser-preview/browser-preview-manager";

export default defineGatewayConfigMutationHandler(async (event) => {
  const previousHosts = hostStore.listWithSecret();
  const userId = event.context.auth!.user.id;
  const config = await readValidatedBody(event, parseGatewayConfig);
  runtimeConfigStore.replace(config);
  const nextHosts = hostStore.listWithSecret();
  const hostsToClose = changedOrDeletedHosts(previousHosts, nextHosts);
  for (const host of hostsToClose) {
    threadBroker.closeHost(host.id);
    terminalManager.closeHost(userId, Number(host.id));
    browserPreviewManager.closeHost(userId, Number(host.id));
  }
  if (hostRuntimeChanged(previousHosts, nextHosts)) {
    sshConnections.syncHosts(nextHosts);
    hostRuntimeSupervisor.syncCurrentUserConfig();
  }
  saveCurrentUserConfig(event);
  return runtimeConfigStore.export();
});

function changedOrDeletedHosts(previousHosts: StoredHostRecord[], nextHosts: StoredHostRecord[]) {
  const nextById = new Map(nextHosts.map((host) => [host.id, host]));
  return previousHosts.filter((previous) => {
    const next = nextById.get(previous.id);
    return !next || hostConnectionFingerprint(previous) !== hostConnectionFingerprint(next);
  });
}

function hostRuntimeChanged(previousHosts: StoredHostRecord[], nextHosts: StoredHostRecord[]) {
  const previousById = new Map(previousHosts.map((host) => [host.id, host]));
  const nextById = new Map(nextHosts.map((host) => [host.id, host]));
  if (previousById.size !== nextById.size) {
    return true;
  }
  for (const previous of previousHosts) {
    const next = nextById.get(previous.id);
    if (!next || hostConnectionFingerprint(previous) !== hostConnectionFingerprint(next)) {
      return true;
    }
  }
  return false;
}

function hostConnectionFingerprint(host: StoredHostRecord) {
  return JSON.stringify({
    sshHost: host.sshHost,
    username: host.username,
    port: host.port,
    authMode: host.authMode,
    privateKeyPath: host.privateKeyPath,
    privateKey: host.privateKey,
    password: host.password,
    proxyUrl: host.proxyUrl,
  });
}
