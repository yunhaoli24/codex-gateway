import pLimit from "p-limit";
import { reactive } from "vue";
import { listRemoteDirectory } from "@/utils/remote-file-transport";
import { gatewayErrorMessage, gatewayErrorPayload } from "@/utils/gateway-error";
import type { RemoteDirectoryState } from "./types";

const DIRECTORY_LOAD_CONCURRENCY = 3;
const DIRECTORY_STALE_AFTER_MS = 30_000;

/**
 * Directory reads share the one remote SFTP channel for a Host. p-limit prevents a deep reveal or
 * a restored tree from sending a burst of concurrent SFTP requests that can starve that channel.
 */
export class RemoteDirectoryLoader {
  private readonly limits = new Map<number, ReturnType<typeof pLimit>>();
  private readonly pending = new Map<string, Promise<RemoteDirectoryState>>();

  createState(path: string) {
    return reactive<RemoteDirectoryState>({
      path,
      entries: [],
      loading: false,
      loaded: false,
      loadedAt: 0,
      error: null,
      errorCode: null,
      stale: true,
    });
  }

  load(state: RemoteDirectoryState, hostId: number, path: string, force = false) {
    if (!force && !isDirectoryStale(state)) return Promise.resolve(state);
    const key = `${hostId}:${path}`;
    const existing = this.pending.get(key);
    if (existing) return existing;

    const request = this.limitFor(hostId)(async () => {
      if (!force && !isDirectoryStale(state)) return state;
      state.loading = true;
      state.error = null;
      state.errorCode = null;
      try {
        const result = await listRemoteDirectory(hostId, path);
        state.path = result.path;
        state.entries = result.entries;
        state.loaded = true;
        state.loadedAt = Date.now();
        state.stale = false;
      } catch (error) {
        const payload = gatewayErrorPayload(error);
        state.error = gatewayErrorMessage(error, "Failed to read remote directory");
        state.errorCode = payload.code ?? null;
        if (isPermanentDirectoryError(payload.statusCode, payload.code)) {
          // A deleted or inaccessible path does not become healthy with time. Mark it loaded so
          // panel activation and visibility recovery do not retry it forever. Explicit refresh or
          // expanding the path again still passes force=true and performs a new SFTP read.
          state.entries = [];
          state.loaded = true;
          state.loadedAt = Date.now();
          state.stale = false;
        }
      } finally {
        state.loading = false;
      }
      return state;
    });
    const tracked = request.finally(() => {
      if (this.pending.get(key) === tracked) this.pending.delete(key);
    });
    this.pending.set(key, tracked);
    return tracked;
  }

  private limitFor(hostId: number) {
    let limit = this.limits.get(hostId);
    if (!limit) {
      limit = pLimit(DIRECTORY_LOAD_CONCURRENCY);
      this.limits.set(hostId, limit);
    }
    return limit;
  }
}

export function isPermanentDirectoryError(statusCode?: number, code?: string) {
  return (
    statusCode === 403 ||
    statusCode === 404 ||
    code === "remoteDirectoryNotFound" ||
    code === "remoteDirectoryAccessDenied"
  );
}

function isDirectoryStale(state: RemoteDirectoryState) {
  // Time-based revalidation is for previously successful and transiently failed reads. A stable
  // 404/403 must stay quiet until an explicit user action forces a retry; otherwise every panel
  // activation resumes the same SFTP/log storm after DIRECTORY_STALE_AFTER_MS.
  if (isPermanentDirectoryError(undefined, state.errorCode ?? undefined)) return false;
  return (
    state.loading ||
    state.stale ||
    !state.loaded ||
    Date.now() - state.loadedAt >= DIRECTORY_STALE_AFTER_MS
  );
}
