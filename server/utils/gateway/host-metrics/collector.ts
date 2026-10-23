import type { HostGpuProcessSnapshot, HostRecord, HostMetricsSample } from "~~/shared/types";
import type { SshConnectionPool } from "../infra/ssh/ssh-connection";
import { AdaptivePollSchedule } from "../infra/background/adaptive-poll-schedule";
import { hostMetricsRemoteCommand } from "./remote-command";
import { HostMetricsRemoteParser } from "./remote-parser";
import { buildHostMetricsSample } from "./sample-builder";
import type { RawHostMetricsSample } from "./types";

const MIN_SAMPLE_DELAY_MS = 2_000;
const MAX_SAMPLE_DELAY_MS = 30_000;
const SAMPLE_TIMEOUT_MS = 45_000;
const GPU_PROCESS_SAMPLE_DELAY_MS = 10_000;
const FAILURE_DELAYS_MS = [5_000, 10_000, 20_000, 30_000] as const;

export interface HostMetricsCollectorCallbacks {
  sample: (sample: HostMetricsSample, gpuProcesses: HostGpuProcessSnapshot | null) => void;
  disconnected: (message: string | null) => void;
  unsupported: (message: string) => void;
  error: (message: string) => void;
}

type CollectionResult =
  | { kind: "sample"; raw: RawHostMetricsSample; elapsedMs: number }
  | { kind: "disconnected"; message: string | null }
  | { kind: "unsupported" }
  | { kind: "error"; message: string };

export class HostMetricsCollector {
  private operation: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private previous: RawHostMetricsSample | null = null;
  private nextGpuProcessSampleAt = 0;
  private readonly schedulePolicy = new AdaptivePollSchedule({
    minimumDelayMs: MIN_SAMPLE_DELAY_MS,
    maximumDelayMs: MAX_SAMPLE_DELAY_MS,
    failureDelaysMs: FAILURE_DELAYS_MS,
  });

  constructor(
    private readonly ssh: SshConnectionPool,
    private readonly host: HostRecord,
    private readonly callbacks: HostMetricsCollectorCallbacks,
  ) {}

  start() {
    if (this.running) return;
    this.running = true;
    void this.collect();
  }

  stop() {
    this.running = false;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.operation?.abort();
  }

  private async collect() {
    if (!this.running || this.operation !== null) return;
    const result = await this.collectOnce().catch((error: unknown): CollectionResult => ({
      kind: "error",
      message: error instanceof Error ? error.message : "Host metrics channel failed",
    }));
    if (!this.running) return;

    switch (result.kind) {
      case "sample": {
        const sample = buildHostMetricsSample(result.raw, this.previous);
        this.previous = result.raw;
        const gpuProcesses = gpuProcessSnapshot(result.raw);
        if (gpuProcesses !== null) {
          this.nextGpuProcessSampleAt = Date.now() + GPU_PROCESS_SAMPLE_DELAY_MS;
        }
        this.callbacks.sample(sample, gpuProcesses);
        this.schedule(this.schedulePolicy.afterSuccess(result.elapsedMs));
        return;
      }
      case "unsupported":
        this.callbacks.unsupported("Host metrics require a Linux /proc filesystem");
        this.running = false;
        return;
      case "disconnected":
        this.callbacks.disconnected(result.message);
        break;
      case "error":
        this.callbacks.error(result.message);
        break;
    }
    this.schedule(this.schedulePolicy.afterFailure());
  }

  private async collectOnce(): Promise<CollectionResult> {
    const startedAt = Date.now();
    const operation = new AbortController();
    this.operation = operation;
    // One native cancellation signal bounds queue wait, channel admission and collection. Stop
    // also aborts that same operation, so a dead SSH channel cannot monopolize the tmux bulkhead.
    const signal = AbortSignal.any([operation.signal, AbortSignal.timeout(SAMPLE_TIMEOUT_MS)]);
    try {
      return await this.ssh.runBackground(
        this.host,
        async (): Promise<CollectionResult> => {
          const result = await this.ssh.execIfConnected(
            this.host,
            hostMetricsRemoteCommand(Date.now() >= this.nextGpuProcessSampleAt),
            { signal, maxOutputBytes: 2 * 1024 * 1024 },
          );
          if (result === null) return { kind: "disconnected", message: null };
          if (result.stdout.includes("@@UNSUPPORTED")) return { kind: "unsupported" };
          const raw = new HostMetricsRemoteParser().push(result.stdout).at(-1);
          if (result.code !== 0 || raw === undefined) {
            return { kind: "error", message: result.stderr.trim() || "Invalid host metrics data" };
          }
          return { kind: "sample", raw, elapsedMs: Date.now() - startedAt };
        },
        { signal },
      );
    } finally {
      if (this.operation === operation) this.operation = null;
    }
  }

  private schedule(delayMs: number) {
    if (!this.running || this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.collect();
    }, delayMs);
  }
}

function gpuProcessSnapshot(raw: RawHostMetricsSample): HostGpuProcessSnapshot | null {
  return raw.gpuProcesses === null
    ? null
    : {
        sampledAt: new Date(raw.sampledAtMs).toISOString(),
        processes: raw.gpuProcesses,
      };
}
