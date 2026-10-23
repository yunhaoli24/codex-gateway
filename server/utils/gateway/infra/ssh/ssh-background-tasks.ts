import { KeyedTaskLimiter } from "../concurrency/keyed-task-limiter";

/**
 * Per-connection bulkhead for best-effort SSH work.
 *
 * Agent RPC, terminals, SFTP, and explicit user actions intentionally bypass this scheduler. Only
 * periodic collectors enter it, so a metrics sample and a tmux scan cannot consume two channels on
 * the same SSH transport at once. ssh2 does not expose channel priority or bandwidth QoS; limiting
 * background concurrency is the dependable isolation mechanism.
 */
export class SshBackgroundTaskScheduler {
  private readonly limiter = new KeyedTaskLimiter(1);

  async run<Result>(
    connectionKey: string,
    task: () => Promise<Result>,
    options: { signal?: AbortSignal } = {},
  ) {
    return await this.limiter.run(connectionKey, task, options);
  }
}
