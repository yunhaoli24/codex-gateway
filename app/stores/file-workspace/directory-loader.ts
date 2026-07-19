import pLimit from "p-limit";
import { reactive } from "vue";
import { listRemoteDirectory } from "@/utils/remote-file-transport";
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
      try {
        const result = await listRemoteDirectory(hostId, path);
        state.path = result.path;
        state.entries = result.entries;
        state.loaded = true;
        state.loadedAt = Date.now();
        state.stale = false;
      } catch (error) {
        state.error = error instanceof Error ? error.message : String(error);
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

function isDirectoryStale(state: RemoteDirectoryState) {
  return (
    state.loading ||
    state.stale ||
    !state.loaded ||
    Date.now() - state.loadedAt >= DIRECTORY_STALE_AFTER_MS
  );
}
