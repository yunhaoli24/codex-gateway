import { getRouterParam } from "h3";
import { sshConnections } from "../../utils/gateway/infra/host-services";
import { defineGatewayEventHandler, saveCurrentUserConfig } from "../../utils/gateway/http/errors";
import { threadBroker } from "../../utils/gateway/runtime/broker";
import { gatewayEventStore } from "../../utils/gateway/state/gateway-events";
import { hostStore } from "../../utils/gateway/state/hosts";
import { projectStore } from "../../utils/gateway/state/projects";
import { threadMetadataStore } from "../../utils/gateway/state/thread-metadata";

export default defineGatewayEventHandler((event) => {
  const id = Number(getRouterParam(event, "id"));
  hostStore.delete(id);
  projectStore.deleteForHost(id);
  threadMetadataStore.deleteForHost(id);
  gatewayEventStore.deleteForHost(id);
  threadBroker.closeHost(id);
  sshConnections.syncHosts(hostStore.listWithSecret());
  saveCurrentUserConfig(event);
  return { ok: true };
});
