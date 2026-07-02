import { hostLifecycleBus } from "../state/host-events";
import { runWithGatewayUser } from "../state/memory";
import { threadBroker } from "./broker";
import type { HostRuntimeSlot } from "./host-runtime-slot";
import { warmPinnedThreads } from "./pinned-thread-warmer";
import { refreshRunningThreadsForHost } from "./running-thread-sync";
import { runtimeLog } from "./runtime-log";

export async function connectHostRuntime(slot: HostRuntimeSlot) {
  await runWithGatewayUser(slot.userId, async () => {
    hostLifecycleBus.emit({
      hostId: slot.hostId,
      status: "connecting",
      message: `${slot.host.name || slot.host.sshHost} 正在建立后台连接`,
    });
    runtimeLog("host background connect", {
      userId: slot.userId,
      hostId: slot.hostId,
      hostName: slot.host.name,
      pinnedThreads: slot.pinnedThreads.filter((thread) => thread.hostId === slot.hostId).length,
    });
    await threadBroker.getHostClient(slot.host);
    await refreshRunningThreadsForHost({
      host: slot.host,
      reason: "host-connected",
    });
    await warmPinnedThreads({
      host: slot.host,
      pinnedThreads: slot.pinnedThreads,
    });
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
      status: "failed",
      message: messageFromError(error),
    });
  });
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
