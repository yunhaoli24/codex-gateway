import type { GatewayConfig } from "~~/shared/types";
import { gatewayEventStore } from "./gateway-events";
import { gatewayMemoryState } from "./memory";
import { hostStore } from "./hosts";
import { projectStore } from "./projects";
import { threadMetadataStore } from "./thread-metadata";

export const runtimeConfigStore = {
  replace(config: GatewayConfig) {
    hostStore.replaceHosts(config.hosts);
    const hostIds = hostStore.hostIds();
    projectStore.pruneToHosts(hostIds);
    threadMetadataStore.pruneToHosts(hostIds);
    gatewayEventStore.pruneToHosts(hostIds);
    gatewayMemoryState.lastOpenThread = config.lastOpenThread ?? null;
  },

  export(): GatewayConfig {
    return {
      version: 1,
      hosts: hostStore.listWithSecret().map((host) => ({
        ...host,
        hasPassword: Boolean(host.password),
      })),
      pinnedThreads: [],
      lastOpenThread: gatewayMemoryState.lastOpenThread ?? null,
    };
  },

  counts() {
    return {
      hosts: hostStore.count(),
      projects: projectStore.count(),
    };
  },
};
