import type {
  HostMetricsCollectorStatus,
  HostGpuProcessSnapshot,
  HostMetricsSample,
  HostMetricsSnapshot,
  HostRecord,
} from "~~/shared/types";
import type { SshConnectionPool } from "../infra/ssh/ssh-connection";
import { HostMetricsCollector } from "./collector";
import { HostMetricsEventBus, type HostMetricsListener } from "./events";
import { hostRuntimeFingerprint } from "../runtime/host-runtime-fingerprint";
import { hostStore } from "../state/hosts";
import { runWithGatewayUser } from "../state/memory";

const MAX_SAMPLES = 300;

interface HostMetricsRuntime {
  collector: HostMetricsCollector;
  host: HostRecord;
  status: HostMetricsCollectorStatus;
  message: string | null;
  samples: HostMetricsSample[];
  gpuProcesses: HostGpuProcessSnapshot | null;
}

export class HostMetricsManager {
  readonly events = new HostMetricsEventBus();
  private runtimes = new Map<string, HostMetricsRuntime>();

  constructor(private readonly ssh: SshConnectionPool) {
    ssh.on("ready", ({ userId, host }) => {
      // Sampling belongs to the connected Host lifecycle, not the visible panel. Closing a
      // panel or hiding a browser only stops delivery; the next subscriber needs the samples
      // collected in between. The collector reuses SSH without initiating reconnects/MFA and
      // retains only MAX_SAMPLES, so this is bounded live history rather than an archive.
      this.ensureCollector(userId, host);
    });
  }

  subscribe(userId: number, host: HostRecord, listener: HostMetricsListener) {
    const unsubscribe = this.events.subscribe(userId, host.id, listener);
    this.ensureCollector(userId, host);
    return unsubscribe;
  }

  snapshot(userId: number, hostId: number): HostMetricsSnapshot {
    const runtime = this.runtimes.get(runtimeKey(userId, hostId));
    return {
      hostId,
      status: runtime?.status ?? "waiting",
      message: runtime?.message ?? null,
      samples: runtime?.samples.slice() ?? [],
      gpuProcesses: runtime?.gpuProcesses ?? null,
    };
  }

  removeHost(userId: number, hostId: number) {
    const key = runtimeKey(userId, hostId);
    this.runtimes.get(key)?.collector.stop();
    this.runtimes.delete(key);
  }

  private ensureCollector(userId: number, host: HostRecord) {
    const configured = runWithGatewayUser(userId, () => hostStore.getWithSecret(host.id));
    // Queued SSH work may finish after an edit/delete. Its ready notification is evidence about
    // that old transport only; it must not recreate a retired collector or replace the current one.
    if (configured === null || hostRuntimeFingerprint(configured) !== hostRuntimeFingerprint(host))
      return;
    const key = runtimeKey(userId, host.id);
    const existing = this.runtimes.get(key);
    if (existing !== undefined) {
      if (hostRuntimeFingerprint(existing.host) === hostRuntimeFingerprint(host))
        existing.collector.start();
      else {
        this.removeHost(userId, host.id);
        this.ensureCollector(userId, host);
      }
      return;
    }

    const collector = new HostMetricsCollector(this.ssh, host, {
      sample: (sample, gpuProcesses) => this.acceptSample(userId, host.id, sample, gpuProcesses),
      disconnected: (message) => this.setStatus(userId, host.id, "disconnected", message),
      unsupported: (message) => this.setStatus(userId, host.id, "unsupported", message),
      error: (message) => this.setStatus(userId, host.id, "error", message),
    });
    const runtime: HostMetricsRuntime = {
      host,
      status: "waiting",
      message: null,
      samples: [],
      gpuProcesses: null,
      collector,
    };
    this.runtimes.set(key, runtime);
    runtime.collector.start();
  }

  private acceptSample(
    userId: number,
    hostId: number,
    sample: HostMetricsSample,
    gpuProcesses: HostGpuProcessSnapshot | null,
  ) {
    const runtime = this.runtimes.get(runtimeKey(userId, hostId));
    if (runtime === undefined) return;
    runtime.samples.push(sample);
    if (runtime.samples.length > MAX_SAMPLES)
      runtime.samples.splice(0, runtime.samples.length - MAX_SAMPLES);
    runtime.status = "collecting";
    runtime.message = null;
    if (gpuProcesses !== null) runtime.gpuProcesses = gpuProcesses;
    this.events.publish(userId, runtime.host.id, {
      type: "sample",
      hostId: runtime.host.id,
      sample,
      gpuProcesses,
    });
  }

  private setStatus(
    userId: number,
    hostId: number,
    status: HostMetricsCollectorStatus,
    message: string | null,
  ) {
    const runtime = this.runtimes.get(runtimeKey(userId, hostId));
    if (runtime === undefined) return;
    runtime.status = status;
    runtime.message = message;
    this.events.publish(userId, runtime.host.id, {
      type: "status",
      snapshot: this.snapshot(userId, runtime.host.id),
    });
  }
}

function runtimeKey(userId: number, hostId: number) {
  return `${userId}:${hostId}`;
}
