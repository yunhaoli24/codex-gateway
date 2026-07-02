import { getRouterParam } from "h3";
import { sshConnections } from "../../utils/gateway/infra/host-services";
import { defineGatewayEventHandler, saveCurrentUserConfig } from "../../utils/gateway/http/errors";
import { threadBroker } from "../../utils/gateway/runtime/broker";
import { hostRuntimeSupervisor } from "../../utils/gateway/runtime/host-runtime-supervisor";
import { gatewayEventStore } from "../../utils/gateway/state/gateway-events";
import { hostStore } from "../../utils/gateway/state/hosts";
import { projectStore } from "../../utils/gateway/state/projects";
import { subAgentThreadStore } from "../../utils/gateway/state/sub-agent-threads";
import { threadMetadataStore } from "../../utils/gateway/state/thread-metadata";
import { threadSnapshotStore } from "../../utils/gateway/state/thread-snapshots";

export default defineGatewayEventHandler((event) => {
  const id = Number(getRouterParam(event, "id"));
  hostStore.delete(id);
  projectStore.deleteForHost(id);
  threadMetadataStore.deleteForHost(id);
  threadSnapshotStore.deleteForHost(id);
  subAgentThreadStore.deleteForHost(id);
  gatewayEventStore.deleteForHost(id);
  threadBroker.closeHost(id);
  sshConnections.syncHosts(hostStore.listWithSecret());
  hostRuntimeSupervisor.syncCurrentUserConfig();
  saveCurrentUserConfig(event);
  return { ok: true };
});
