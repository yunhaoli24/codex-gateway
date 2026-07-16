import { browserPreviewManager } from "../browser-preview/browser-preview-manager";
import { gatewayEventStore } from "../state/gateway-events";
import { projectStore } from "../state/projects";
import { subAgentThreadStore } from "../state/sub-agent-threads";
import { threadMetadataStore } from "../state/thread-metadata";
import { threadSnapshotStore } from "../state/thread-snapshots";
import { terminalManager } from "../terminal/terminal-manager";
import { tmuxMonitorService } from "../tmux-monitor/monitor-service";
import type { StoredHostRecord } from "../state/memory";
import { threadBroker } from "./broker";
import { hostRuntimeFingerprint } from "./host-runtime-fingerprint";

export const hostResourceLifecycle = {
  changed(userId: number, previous: StoredHostRecord, next: StoredHostRecord) {
    if (hostRuntimeFingerprint(previous) === hostRuntimeFingerprint(next)) return;
    closeEphemeralResources(userId, previous.id);
    if (remoteIdentityFingerprint(previous) !== remoteIdentityFingerprint(next)) {
      clearThreadRuntime(previous.id);
      tmuxMonitorService.repository.deleteHost(userId, previous.id);
    }
  },

  deleted(userId: number, hostId: number) {
    projectStore.deleteForHost(hostId);
    clearThreadRuntime(hostId);
    closeEphemeralResources(userId, hostId);
    tmuxMonitorService.repository.deleteHost(userId, hostId);
  },
};

function closeEphemeralResources(userId: number, hostId: number) {
  threadBroker.closeHost(hostId);
  terminalManager.closeHost(userId, hostId);
  browserPreviewManager.closeHost(userId, hostId);
}

function clearThreadRuntime(hostId: number) {
  threadMetadataStore.deleteForHost(hostId);
  threadSnapshotStore.deleteForHost(hostId);
  subAgentThreadStore.deleteForHost(hostId);
  gatewayEventStore.deleteForHost(hostId);
}

// Credentials and proxies can rotate without changing the remote tmux server.
// These fields identify a different machine/user namespace and invalidate pane identities.
function remoteIdentityFingerprint(host: StoredHostRecord) {
  return JSON.stringify({
    sshHost: host.sshHost,
    username: host.username,
    port: host.port,
  });
}
