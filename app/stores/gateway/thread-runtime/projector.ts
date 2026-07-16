import type { ThreadRuntimeStatus } from "~~/shared/types";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadActivityStore } from "@/stores/gateway-thread-activity";
import { useGatewayThreadRuntimeStore } from "@/stores/gateway-thread-runtime";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { activeRemoteTurnId } from "../thread-turns/active-turn";
import { pinnedKey } from "../thread-utils/identity";
import { syncThreadCompletionAttention } from "./completion-attention";

export interface ThreadRuntimeProjection {
  key: string;
  status: ThreadRuntimeStatus;
  activeTurnId: string | null;
  canSteer: boolean;
  canInterrupt: boolean;
}

export interface ThreadRuntimeStatusInput {
  status: ThreadRuntimeStatus;
  turnId?: string | null;
}

export interface ActiveTerminalProcessInput {
  turnId: string;
  itemId: string;
  processId: string;
}

export function projectThreadRuntime(hostId: number, threadId: string): ThreadRuntimeProjection {
  const runtime = useGatewayThreadRuntimeStore();
  const key = pinnedKey(hostId, threadId);
  const status = runtime.threadStatuses[key] ?? "idle";
  const activeTurnId = activeTurnIdForStatus(hostId, threadId, status);
  return {
    key,
    status,
    activeTurnId,
    canSteer: status === "running" && Boolean(activeTurnId),
    canInterrupt: status === "running" && Boolean(activeTurnId),
  };
}

export function applyThreadRuntimeStatus(
  hostId: number,
  threadId: string,
  input: ThreadRuntimeStatusInput,
) {
  const runtime = useGatewayThreadRuntimeStore();
  const key = pinnedKey(hostId, threadId);
  const runningKeys = new Set(runtime.runningThreadKeys);
  const previousStatus = runtime.threadStatuses[key];

  runtime.threadStatuses = { ...runtime.threadStatuses, [key]: input.status };
  useGatewayThreadActivityStore().recordRuntimeStatus(hostId, threadId, input.status);
  syncThreadCompletionAttention(hostId, threadId, previousStatus, input.status);

  if (input.status === "running") {
    runningKeys.add(key);
    if (input.turnId) {
      runtime.activeTurnIdsByThreadKey = {
        ...runtime.activeTurnIdsByThreadKey,
        [key]: input.turnId,
      };
    }
  } else {
    // Terminal app-server status is authoritative. History may retain stale
    // in-progress items after reconnect, so it must never keep steer enabled.
    runningKeys.delete(key);
    runtime.activeTurnIdsByThreadKey = omitKey(runtime.activeTurnIdsByThreadKey, key);
    runtime.activeTerminalProcessByThreadKey = omitKey(
      runtime.activeTerminalProcessByThreadKey,
      key,
    );
  }
  runtime.runningThreadKeys = [...runningKeys];
}

export function rememberThreadTerminalProcess(
  hostId: number,
  threadId: string,
  input: ActiveTerminalProcessInput,
) {
  const runtime = useGatewayThreadRuntimeStore();
  const key = pinnedKey(hostId, threadId);
  runtime.activeTerminalProcessByThreadKey = {
    ...runtime.activeTerminalProcessByThreadKey,
    [key]: input,
  };
  applyThreadRuntimeStatus(hostId, threadId, { status: "running", turnId: input.turnId });
}

export function clearThreadTerminalProcess(
  hostId: number,
  threadId: string,
  input: { turnId: string; itemId: string },
) {
  const runtime = useGatewayThreadRuntimeStore();
  const key = pinnedKey(hostId, threadId);
  const active = runtime.activeTerminalProcessByThreadKey[key];
  if (!active || active.turnId !== input.turnId || active.itemId !== input.itemId) return;
  runtime.activeTerminalProcessByThreadKey = omitKey(runtime.activeTerminalProcessByThreadKey, key);
  // A command item finishing is not the same as a turn finishing. app-server's
  // turn/completed event remains responsible for leaving the running state.
}

function activeTurnIdForStatus(hostId: number, threadId: string, status: ThreadRuntimeStatus) {
  if (status !== "running") return null;
  const navigation = useGatewayNavigationStore();
  const runtime = useGatewayThreadRuntimeStore();
  const views = useGatewayThreadViewStore();
  const key = pinnedKey(hostId, threadId);
  const history =
    navigation.selectedHostId === hostId && navigation.selectedThreadId === threadId
      ? views.history
      : views.threadViews[key]?.history;
  return (
    runtime.activeTurnIdsByThreadKey[key] ??
    runtime.activeTerminalProcessByThreadKey[key]?.turnId ??
    activeRemoteTurnId(history) ??
    null
  );
}

function omitKey<T>(record: Record<string, T>, key: string) {
  const { [key]: _removed, ...remaining } = record;
  return remaining;
}
