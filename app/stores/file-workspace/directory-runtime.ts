import { reactive } from "vue";
import { listRemoteDirectory } from "@/utils/remote-file-transport";
import type { RemoteDirectoryState } from "./types";

export function createDirectoryState(path: string) {
  return reactive<RemoteDirectoryState>({
    path,
    entries: [],
    loading: false,
    loaded: false,
    error: null,
    stale: true,
  });
}

export async function loadDirectoryState(
  state: RemoteDirectoryState,
  hostId: number,
  path: string,
  force: boolean,
) {
  if (!import.meta.client || state.loading || (!force && !state.stale && state.loaded)) {
    return state;
  }
  state.loading = true;
  state.error = null;
  try {
    const result = await listRemoteDirectory(hostId, path);
    state.path = result.path;
    state.entries = result.entries;
    state.loaded = true;
    state.stale = false;
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  } finally {
    state.loading = false;
  }
  return state;
}
