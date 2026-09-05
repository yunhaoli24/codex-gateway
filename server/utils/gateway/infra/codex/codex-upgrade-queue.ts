import pLimit from "p-limit";
import pRetry from "p-retry";
import { currentGatewayUserId, runWithGatewayUser } from "../../state/memory";
import type { HostWithSecret } from "../ssh/ssh-types";
import { codexUpgradeError, codexUpgradeLog } from "./codex-upgrade-log";
import { isTransientUpgradeError } from "./codex-install-errors";
import { hostLifecycleBus } from "../../state/host-events";

const UPGRADE_CONCURRENCY = 3;

/**
 * Remote installs share the Gateway's outbound bandwidth, so only artifact preparation, transfer,
 * and installation enter this bounded queue. Three slots prevent one slow Host from blocking every
 * upgrade while keeping version probes and normal Host traffic outside the queue.
 */
export class CodexUpgradeQueue {
  private readonly limit = pLimit(UPGRADE_CONCURRENCY);

  get busy() {
    return this.limit.activeCount > 0 || this.limit.pendingCount > 0;
  }

  async run<T>(host: HostWithSecret, work: (attempt: number) => Promise<T>) {
    // Retry wraps admission, never the work inside a slot. Every rejected attempt releases p-limit
    // before backoff/re-enqueue, allowing other Hosts to proceed even if three uploads stall at once.
    return await pRetry((attempt) => this.runAttempt(host, work, attempt), {
      retries: 2,
      minTimeout: 1_000,
      factor: 2,
      shouldRetry: ({ error, attemptNumber, retriesLeft }) => {
        if (!isTransientUpgradeError(error)) return false;
        codexUpgradeLog("workflow retry scheduled", host, {
          attempt: attemptNumber,
          retriesLeft,
          message: error.message,
        });
        hostLifecycleBus.emit({
          hostId: host.id,
          status: "upgrading",
          message: `${host.name || host.sshHost} 升级暂时失败，将重新排到队尾重试`,
        });
        return true;
      },
    });
  }

  private async runAttempt<T>(
    host: HostWithSecret,
    work: (attempt: number) => Promise<T>,
    attempt: number,
  ) {
    const userId = currentGatewayUserId();
    const queuedAt = Date.now();
    codexUpgradeLog("workflow queued", host, {
      attempt,
      queuePosition: this.limit.activeCount + this.limit.pendingCount + 1,
    });
    return await this.limit(async () => {
      const run = async () => {
        const startedAt = Date.now();
        codexUpgradeLog("workflow started", host, { queueWaitMs: startedAt - queuedAt });
        try {
          const result = await work(attempt);
          codexUpgradeLog("workflow completed", host, { durationMs: Date.now() - startedAt });
          return result;
        } catch (error: unknown) {
          codexUpgradeError("workflow failed", host, error, {
            durationMs: Date.now() - startedAt,
          });
          throw error;
        }
      };
      return await (userId === null ? run() : runWithGatewayUser(userId, run));
    });
  }
}
