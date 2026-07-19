import { reactive, ref } from "vue";
import { fileWorkspaceScopeKey } from "./paths";
import type { FileWorkspaceScope } from "./types";

/** Persisted workspace scope is intentionally separate from runtime documents and directory
 * entries. Only this small routing/open-tab shape belongs in localStorage. */
export function createFileWorkspaceScopeState(options: {
  clearDirectories: (scopeKey: string) => void;
}) {
  const scopes = ref<Record<string, FileWorkspaceScope>>({});
  const workspaceOpenRequest = ref<{ scopeKey: string; sequence: number } | null>(null);

  function scopeFor(hostId: number, threadId: string) {
    return scopes.value[fileWorkspaceScopeKey(hostId, threadId)] ?? null;
  }

  function setScopeRoot(input: {
    hostId: number;
    projectId: number | null;
    threadId: string;
    rootPath: string;
  }) {
    const key = fileWorkspaceScopeKey(input.hostId, input.threadId);
    const existing = scopes.value[key];
    if (existing) {
      existing.projectId = input.projectId;
      if (existing.rootPath !== input.rootPath) {
        existing.rootPath = input.rootPath;
        existing.expandedPaths = [input.rootPath];
        options.clearDirectories(key);
      }
      return existing;
    }
    const scope = reactive<FileWorkspaceScope>({
      ...input,
      openPaths: [],
      activePath: null,
      expandedPaths: [input.rootPath],
    });
    scopes.value = { ...scopes.value, [key]: scope };
    return scope;
  }

  return { scopes, workspaceOpenRequest, scopeFor, setScopeRoot };
}
