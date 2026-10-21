import type { GatewayConfig } from "~~/shared/types";
import { normalizeNotificationSettings } from "~~/shared/config";
import { gatewayEventStore } from "./gateway-events";
import { currentGatewayMemoryState } from "./memory";
import { normalizePinnedThreads } from "./memory";
import { hostStore } from "./hosts";
import { projectStore } from "./projects";
import { subAgentThreadStore } from "./sub-agent-threads";
import { threadMetadataStore } from "./thread-metadata";

export const runtimeConfigStore = {
  replace(config: GatewayConfig) {
    hostStore.replaceHosts(config.hosts);
    const hostIds = hostStore.hostIds();
    projectStore.pruneToHosts(hostIds);
    threadMetadataStore.pruneToHosts(hostIds);
    subAgentThreadStore.pruneToHosts(hostIds);
    gatewayEventStore.pruneToHosts(hostIds);
    currentGatewayMemoryState().pinnedThreads = normalizePinnedThreads(
      config.pinnedThreads ?? [],
    ).filter((thread) => hostIds.has(thread.hostId));
    currentGatewayMemoryState().notifications = normalizeNotificationSettings(config.notifications);
  },

  replacePinnedThreads(pinnedThreads: GatewayConfig["pinnedThreads"]) {
    const hostIds = hostStore.hostIds();
    currentGatewayMemoryState().pinnedThreads = normalizePinnedThreads(pinnedThreads).filter(
      (thread) => hostIds.has(thread.hostId),
    );
  },

  replaceNotifications(notifications: GatewayConfig["notifications"]) {
    currentGatewayMemoryState().notifications = normalizeNotificationSettings(notifications);
  },

  export(): GatewayConfig {
    return {
      version: 2,
      hosts: hostStore.listWithSecret().map((host) => ({
        ...host,
        hasPassword: Boolean(host.password),
      })),
      pinnedThreads: currentGatewayMemoryState().pinnedThreads,
      notifications: normalizeNotificationSettings(currentGatewayMemoryState().notifications),
    };
  },

  counts() {
    return {
      hosts: hostStore.count(),
      projects: projectStore.count(),
    };
  },
};
