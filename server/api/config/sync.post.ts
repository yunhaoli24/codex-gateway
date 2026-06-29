import { readValidatedBody } from "h3";
import { sshConnections } from "../../utils/gateway/infra/host-services";
import { gatewayConfigSchema } from "../../utils/gateway/http/validation";
import { threadBroker } from "../../utils/gateway/runtime/broker";
import { hostStore } from "../../utils/gateway/state/hosts";
import { runtimeConfigStore } from "../../utils/gateway/state/runtime-config";

export default defineEventHandler(async (event) => {
  const previousHosts = hostStore.listWithSecret();
  const config = await readValidatedBody(event, (body) => gatewayConfigSchema.parse(body));
  runtimeConfigStore.replace(config);
  const nextHosts = hostStore.listWithSecret();
  for (const host of changedHosts(previousHosts, nextHosts)) {
    threadBroker.closeHost(host.id);
  }
  sshConnections.syncHosts(nextHosts);
  return runtimeConfigStore.export();
});

function changedHosts(
  previousHosts: Array<Record<string, unknown>>,
  nextHosts: Array<Record<string, unknown>>,
) {
  const nextById = new Map(nextHosts.map((host) => [host.id, host]));
  return previousHosts.filter((previous) => {
    const next = nextById.get(previous.id);
    return !next || hostConnectionFingerprint(previous) !== hostConnectionFingerprint(next);
  });
}

function hostConnectionFingerprint(host: Record<string, unknown>) {
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
