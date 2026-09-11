import { hostLifecycleBus } from "../state/host-events";
import { runWithGatewayUser } from "../state/memory";
import { threadBroker } from "./broker";
import type { HostRuntimeSlot } from "./host-runtime-slot";
import { refreshRunningThreadsForHost } from "./running-thread-sync";
import { runtimeLog } from "./runtime-log";
import { activeMainThreadMonitor } from "./active-main-thread-monitor";
import { hostMfaManager } from "../host-mfa/host-mfa-instance";

export async function connectHostRuntime(slot: HostRuntimeSlot, isCurrent: () => boolean) {
  await runWithGatewayUser(slot.userId, async () => {
    if (!isCurrent()) return;
    hostLifecycleBus.emit({
      hostId: slot.hostId,
      status: "connecting",
      message: `${slot.host.name || slot.host.sshHost} 正在建立后台连接`,
    });
    runtimeLog("host background connect", {
      userId: slot.userId,
      hostId: slot.hostId,
      hostName: slot.host.name,
    });
    const client = await threadBroker.getHostClient(slot.host);
    if (!isCurrent()) return;
    // Browser WebSockets outlive an app-server transport reconnect. Their local event listeners
    // retain lease counts in the registry, so rebuild those upstream controllers before restoring
    // background-only monitoring; otherwise an idle selected thread silently stops receiving.
    await threadBroker.restoreRetainedSubscriptions(slot.host);
    if (!isCurrent()) return;
    await activeMainThreadMonitor.recoverHost({
      host: slot.host,
      client,
      hasController: (threadId) => threadBroker.hasController(slot.host.id, threadId),
    });
    if (!isCurrent()) return;
    await refreshRunningThreadsForHost({
      host: slot.host,
      reason: "host-connected",
    });
    if (!isCurrent()) return;
    runtimeLog("host background ready", {
      userId: slot.userId,
      hostId: slot.hostId,
      hostName: slot.host.name,
    });
  });
}

export function publishHostRuntimeFailure(slot: HostRuntimeSlot, error: unknown) {
  runtimeLog("host background connect failed", {
    userId: slot.userId,
    hostId: slot.hostId,
    message: messageFromError(error),
  });
  runWithGatewayUser(slot.userId, () => {
    hostLifecycleBus.emit({
      hostId: slot.hostId,
      status: hostMfaManager.isMfaHost(slot.userId, slot.hostId) ? "mfaRequired" : "failed",
      message: hostMfaManager.isMfaHost(slot.userId, slot.hostId)
        ? "需要手动输入 MFA 验证码后重新连接"
        : messageFromError(error),
    });
  });
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
