import type { GatewayConfig } from "~~/shared/types";
import { normalizeNotificationSettings } from "~~/shared/config";
import { gatewayEventStore } from "./gateway-events";
import { gatewayMemoryState } from "./memory";
import { normalizePinnedThreads } from "./memory";
import { hostStore } from "./hosts";
import { projectStore } from "./projects";
import { subAgentThreadStore } from "./sub-agent-threads";
import { threadMetadataStore } from "./thread-metadata";
import { threadSnapshotStore } from "./thread-snapshots";

export const runtimeConfigStore = {
  replace(config: GatewayConfig) {
    hostStore.replaceHosts(config.hosts);
    projectStore.replaceProjects(config.projects ?? []);
    const hostIds = hostStore.hostIds();
    projectStore.pruneToHosts(hostIds);
    threadMetadataStore.pruneToHosts(hostIds);
    threadSnapshotStore.pruneToHosts(hostIds);
    subAgentThreadStore.pruneToHosts(hostIds);
    gatewayEventStore.pruneToHosts(hostIds);
    gatewayMemoryState.pinnedThreads = normalizePinnedThreads(config.pinnedThreads ?? []).filter(
      (thread) => hostIds.has(thread.hostId),
    );
    gatewayMemoryState.notifications = normalizeNotificationSettings(config.notifications);
  },

  export(): GatewayConfig {
    return {
      version: 1,
      hosts: hostStore.listWithSecret().map((host) => ({
        ...host,
        hasPassword: Boolean(host.password),
      })),
      projects: projectStore.list(),
      pinnedThreads: gatewayMemoryState.pinnedThreads,
      notifications: normalizeNotificationSettings(gatewayMemoryState.notifications),
    };
  },

  counts() {
    return {
      hosts: hostStore.count(),
      projects: projectStore.count(),
    };
  },
};
