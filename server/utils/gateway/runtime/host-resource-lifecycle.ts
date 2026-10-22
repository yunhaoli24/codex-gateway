import { browserPreviewManager } from "../browser-preview/browser-preview-manager";
import { subAgentThreadStore } from "../state/sub-agent-threads";
import { threadMetadataStore } from "../state/thread-metadata";
import { terminalManager } from "../terminal/terminal-manager";
import { tmuxMonitorService } from "../tmux-monitor/monitor-service";
import type { StoredHostRecord } from "../state/memory";
import { threadBroker } from "./broker";
import { hostRuntimeFingerprint } from "./host-runtime-fingerprint";
import { activeMainThreadMonitor } from "./active-main-thread-monitor";
import { threadProjectDiscovery } from "./thread-project-discovery";
import { pendingServerRequests } from "./pending-server-requests";
import { hostMetricsManager } from "../infra/host-services";
import { threadRuntimeStatusHub } from "./thread-runtime-status-hub";

export const hostResourceLifecycle = {
  changed(userId: number, previous: StoredHostRecord, next: StoredHostRecord) {
    if (hostRuntimeFingerprint(previous) === hostRuntimeFingerprint(next)) return;
    closeEphemeralResources(userId, previous.id);
    if (remoteIdentityFingerprint(previous) !== remoteIdentityFingerprint(next)) {
      threadProjectDiscovery.invalidateHost(userId, previous.id);
      clearThreadRuntime(userId, previous.id);
      tmuxMonitorService.removeHost(userId, previous.id);
      hostMetricsManager.removeHost(userId, previous.id);
    }
  },

  deleted(userId: number, hostId: number) {
    // Config relations were removed inside UserConfigMutationService's draft transaction.
    // This hook is deliberately limited to ephemeral resources so it cannot create a
    // memory/SQLite split after the durable commit has already succeeded.
    threadProjectDiscovery.invalidateHost(userId, hostId);
    clearThreadRuntime(userId, hostId);
    closeEphemeralResources(userId, hostId);
    tmuxMonitorService.removeHost(userId, hostId);
    hostMetricsManager.removeHost(userId, hostId);
  },
};

function closeEphemeralResources(userId: number, hostId: number) {
  pendingServerRequests.deleteHost(userId, hostId);
  activeMainThreadMonitor.forgetHost(userId, hostId);
  threadBroker.closeHost(hostId);
  terminalManager.closeHost(userId, hostId);
  browserPreviewManager.closeHost(userId, hostId);
}

function clearThreadRuntime(userId: number, hostId: number) {
  threadRuntimeStatusHub.deleteHost(userId, hostId);
  threadMetadataStore.deleteForHost(hostId);
  subAgentThreadStore.deleteForHost(hostId);
  // Remote transcripts/replay/pages have their own idle lifetime. Removing one user's Host
  // releases only its connection lease; it must not erase the other users' shared conversation.
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
