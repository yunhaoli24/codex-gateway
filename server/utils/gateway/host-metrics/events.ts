import type {
  HostGpuProcessSnapshot,
  HostMetricsSample,
  HostMetricsSnapshot,
} from "~~/shared/types";

export type HostMetricsEvent =
  | {
      type: "sample";
      hostId: number;
      sample: HostMetricsSample;
      gpuProcesses: HostGpuProcessSnapshot | null;
    }
  | { type: "status"; snapshot: HostMetricsSnapshot };

export type HostMetricsListener = (event: HostMetricsEvent) => void;

export class HostMetricsEventBus {
  private listeners = new Map<string, Set<HostMetricsListener>>();

  subscribe(userId: number, hostId: number, listener: HostMetricsListener) {
    const key = metricsKey(userId, hostId);
    const listeners = this.listeners.get(key) ?? new Set();
    listeners.add(listener);
    this.listeners.set(key, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(key);
    };
  }

  publish(userId: number, hostId: number, event: HostMetricsEvent) {
    for (const listener of this.listeners.get(metricsKey(userId, hostId)) ?? []) listener(event);
  }
}

function metricsKey(userId: number, hostId: number) {
  return `${userId}:${hostId}`;
}
