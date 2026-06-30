import type { ThreadStatusProbeResult } from "~~/shared/types";
import { gatewayApi } from "@/utils/gateway-api";
import { runtimeStatusFromAppThreadStatus } from "../thread-utils/status";
import { pinnedKey } from "../thread-utils/identity";
import type { GatewayStoreContext } from "../types";

const PROBE_INTERVAL_MS = 5_000;

export function scheduleRunningThreadStatusProbe(ctx: GatewayStoreContext) {
  if (!import.meta.client || ctx.state.runningThreadStatusProbeTimer) {
    return;
  }
  if (!ctx.state.runningThreadKeys.length) {
    return;
  }
  ctx.state.runningThreadStatusProbeTimer = window.setTimeout(() => {
    ctx.state.runningThreadStatusProbeTimer = null;
    void probeRunningThreadStatuses(ctx);
  }, PROBE_INTERVAL_MS);
}

export function cancelRunningThreadStatusProbe(ctx: GatewayStoreContext) {
  if (!import.meta.client || !ctx.state.runningThreadStatusProbeTimer) {
    return;
  }
  window.clearTimeout(ctx.state.runningThreadStatusProbeTimer);
  ctx.state.runningThreadStatusProbeTimer = null;
}

export async function probeRunningThreadStatuses(ctx: GatewayStoreContext) {
  if (!import.meta.client || !ctx.state.runningThreadKeys.length) {
    cancelRunningThreadStatusProbe(ctx);
    return;
  }

  const probing = new Set(ctx.state.probingThreadStatusKeys);
  const targets = ctx.state.runningThreadKeys
    .map((key) => parseThreadKey(key))
    .filter((target) => target && !probing.has(pinnedKey(target.hostId, target.threadId)));

  if (!targets.length) {
    scheduleRunningThreadStatusProbe(ctx);
    return;
  }

  ctx.state.probingThreadStatusKeys = [
    ...new Set([...ctx.state.probingThreadStatusKeys, ...targets.map((target) => target!.key)]),
  ];
  try {
    await Promise.allSettled(targets.map((target) => probeThreadStatus(ctx, target!)));
  } finally {
    const completed = new Set(targets.map((target) => target!.key));
    ctx.state.probingThreadStatusKeys = ctx.state.probingThreadStatusKeys.filter(
      (key) => !completed.has(key),
    );
    scheduleRunningThreadStatusProbe(ctx);
  }
}

async function probeThreadStatus(
  ctx: GatewayStoreContext,
  target: { key: string; hostId: number; threadId: string },
) {
  const result = await gatewayApi<ThreadStatusProbeResult>("/api/threads/status", {
    query: {
      hostId: target.hostId,
      threadId: target.threadId,
    },
  });
  const status = runtimeStatusFromAppThreadStatus(result.status);
  ctx.setThreadStatus(target.hostId, target.threadId, status, { notifyTerminal: true });
}

function parseThreadKey(key: string) {
  const separator = key.indexOf(":");
  if (separator <= 0) {
    return null;
  }
  const hostId = Number(key.slice(0, separator));
  const threadId = key.slice(separator + 1);
  if (!Number.isInteger(hostId) || !threadId) {
    return null;
  }
  return { key, hostId, threadId };
}
