import type { HostWithSecret } from "./ssh-types";

const UPLOAD_IDLE_TIMEOUT_MS = 120_000;
const PROGRESS_LOG_INTERVAL_MS = 30_000;

interface UploadMonitor {
  signal: AbortSignal;
  phase(name: string): void;
  track(readAcknowledgedBytes: () => number): void;
}

export async function withSftpUploadProgress(
  host: HostWithSecret,
  totalBytes: number,
  closeChannel: () => void,
  upload: (monitor: UploadMonitor) => Promise<void>,
) {
  const controller = new AbortController();
  const idle = Promise.withResolvers<never>();
  let phase = "open SFTP";
  let bytes = 0;
  let readBytes = () => bytes;
  let lastProgressAt = Date.now();
  let lastLogAt = lastProgressAt;
  const details = () => ({
    hostId: host.id,
    hostName: host.name,
    phase,
    bytes,
    totalBytes,
    idleMs: Date.now() - lastProgressAt,
  });
  // Bound every SFTP phase, including channel open/stat/rename. A live SSH keepalive cannot prove
  // that a particular SFTP request is making progress. Slow uploads may run indefinitely while
  // acknowledgements advance; a fixed total deadline would discard their valid progress.
  const timer = setInterval(() => {
    const acknowledged = readBytes();
    if (acknowledged > bytes) {
      bytes = acknowledged;
      lastProgressAt = Date.now();
    }
    if (Date.now() - lastLogAt >= PROGRESS_LOG_INTERVAL_MS) {
      console.info("[gateway-ssh] SFTP upload progress", details());
      lastLogAt = Date.now();
    }
    if (Date.now() - lastProgressAt >= UPLOAD_IDLE_TIMEOUT_MS) {
      const error = new Error(
        `SFTP upload timed out in ${phase} after 120s without progress (${bytes}/${totalBytes} bytes)`,
      );
      console.warn("[gateway-ssh] SFTP upload stalled", details());
      // Settle with the retryable timeout before pipeline emits its generic AbortError. Abort plus
      // the checks after each await prevent a late callback from starting writes in a retired attempt.
      idle.reject(error);
      controller.abort(error);
      closeChannel();
      clearInterval(timer);
    }
  }, 1_000);
  try {
    await Promise.race([
      idle.promise,
      upload({
        signal: controller.signal,
        phase(name) {
          controller.signal.throwIfAborted();
          phase = name;
          lastProgressAt = Date.now();
        },
        track(readAcknowledgedBytes) {
          controller.signal.throwIfAborted();
          phase = "write";
          readBytes = readAcknowledgedBytes;
          bytes = readBytes();
          lastProgressAt = Date.now();
          console.info("[gateway-ssh] SFTP upload resumed", details());
        },
      }),
    ]);
  } finally {
    clearInterval(timer);
  }
}
