import { defineStore, skipHydrate } from "pinia";
import { shallowRef } from "vue";
import { useAccountLocalStorage } from "@/composables/storage/useAccountLocalStorage";
import { deleteRemoteFile } from "@/utils/remote-file-transport";
import {
  discardFileDocumentDraft,
  saveFileDocument,
  updateFileDocumentDraft,
} from "./document-runtime";
import { createFileDocumentActions } from "./document-actions";
import { isPermanentDirectoryError, RemoteDirectoryLoader } from "./directory-loader";
import { createFileWorkspaceScopeState } from "./scope-state";
import {
  absolutePath,
  directoryStateKey,
  directoryPathsToFile,
  parentPath,
  parentPaths,
  withoutPathAndDescendants,
} from "./paths";
import type { RemoteDirectoryState } from "./types";
import type { FileWorkspaceScope } from "./types";
import { useFileGitComparisonStore } from "./git";
import { useFileGitWorkspaceStore } from "./git/workspace";

export { fileWorkspaceScopeKey } from "./paths";

export const useGatewayFileWorkspaceStore = defineStore("gateway-file-workspace", () => {
  const directories = shallowRef<Record<string, RemoteDirectoryState>>({});
  const directoryLoader = new RemoteDirectoryLoader();
  const gitComparisons = useFileGitComparisonStore();
  const gitWorkspaces = useFileGitWorkspaceStore();
  const scopes = useAccountLocalStorage<Record<string, FileWorkspaceScope>>(
    "file-workspace-scopes",
    {},
  );
  const { workspaceOpenRequest, scopeFor, setScopeRoot } = createFileWorkspaceScopeState({
    scopes: skipHydrate(scopes),
    clearDirectories: clearScopeDirectories,
  });

  const documentActions = createFileDocumentActions({
    scopeFor,
    setScopeRoot,
    workspaceOpenRequest,
  });

  async function restoreScope(hostId: number, threadId: string) {
    const scope = scopeFor(hostId, threadId);
    if (!scope) {
      return;
    }
    await documentActions.restoreScopeDocuments(hostId, threadId);
    await refreshExpandedDirectories(hostId, threadId, false);
  }

  async function loadDirectory(hostId: number, threadId: string, path: string, force = false) {
    const scope = scopeFor(hostId, threadId);
    if (!scope) {
      return null;
    }
    const key = directoryStateKey(hostId, threadId, path);
    const state = ensureDirectoryState(key, path);
    const result = await directoryLoader.load(state, scope.hostId, path, force);
    if (isPermanentDirectoryError(undefined, result.errorCode ?? undefined)) {
      scope.expandedPaths = withoutPathAndDescendants(scope.expandedPaths, path);
    }
    return result;
  }

  function directoryFor(hostId: number, threadId: string, path: string) {
    return directories.value[directoryStateKey(hostId, threadId, path)] ?? null;
  }

  async function setExpandedPaths(hostId: number, threadId: string, paths: string[]) {
    const scope = scopeFor(hostId, threadId);
    if (!scope) {
      return;
    }
    const added = paths.filter((path) => !scope.expandedPaths.includes(path));
    scope.expandedPaths = paths;
    await Promise.all(
      added.map((path) => {
        const state = directoryFor(hostId, threadId, path);
        return loadDirectory(
          hostId,
          threadId,
          path,
          isPermanentDirectoryError(undefined, state?.errorCode ?? undefined),
        );
      }),
    );
  }

  async function revealFileInTree(hostId: number, threadId: string, path: string) {
    const scope = scopeFor(hostId, threadId);
    if (!scope) {
      return false;
    }
    const ancestors = directoryPathsToFile(scope.rootPath, path);
    if (!ancestors.length) {
      return false;
    }
    await setExpandedPaths(hostId, threadId, [...new Set([...scope.expandedPaths, ...ancestors])]);
    return true;
  }

  async function refreshExpandedDirectories(hostId: number, threadId: string, force = false) {
    const scope = scopeFor(hostId, threadId);
    if (!scope) {
      return;
    }
    // p-limit preserves enqueue order. Prioritize the root and active-file parent so returning to
    // a file workspace is useful before less relevant expanded branches finish refreshing.
    const prioritized = [
      scope.rootPath,
      scope.activePath === null ? null : parentPath(scope.activePath),
      ...scope.expandedPaths,
    ].filter((path): path is string => path !== null && path !== "");
    await Promise.all(
      [...new Set(prioritized)].map((path) => loadDirectory(hostId, threadId, path, force)),
    );
  }

  async function deleteFile(hostId: number, threadId: string, path: string) {
    await deleteRemoteFile(hostId, path);
    documentActions.closeFile(hostId, threadId, path);
    const directoryPath = parentPath(path);
    const directory = directoryFor(hostId, threadId, directoryPath);
    if (directory) {
      directory.stale = true;
      await loadDirectory(hostId, threadId, directoryPath, true);
    }
    invalidateGitWorkspace(hostId, threadId);
  }

  async function saveDocument(document: Parameters<typeof saveFileDocument>[0], force = false) {
    const result = await saveFileDocument(document, force);
    if (result.ok && result.wrote) {
      void gitComparisons.load(document, true);
      invalidateGitWorkspace(document.hostId, document.threadId);
    }
    return result.ok;
  }

  async function discardDocumentDraft(document: Parameters<typeof discardFileDocumentDraft>[0]) {
    discardFileDocumentDraft(document);
    await documentActions.reloadDocument(document);
    void gitComparisons.load(document, true);
    invalidateGitWorkspace(document.hostId, document.threadId);
  }

  function markRemoteFilesChanged(hostId: number, threadId: string, paths: string[]) {
    const scope = scopeFor(hostId, threadId);
    if (!scope) {
      return;
    }
    if (scope.rootPath !== "") {
      gitWorkspaces.invalidate({
        hostId: scope.hostId,
        cwd: scope.rootPath,
        rootPath: scope.rootPath,
      });
    }
    const directoriesToRefresh = new Set<string>();
    for (const sourcePath of paths) {
      const path = absolutePath(scope.rootPath, sourcePath);
      const document = documentActions.documentFor(hostId, threadId, path);
      if (document) {
        documentActions.invalidateDocument(document);
        gitComparisons.invalidate(document);
      }
      for (const parent of parentPaths(path)) {
        const directory = directoryFor(hostId, threadId, parent);
        if (directory) {
          directory.stale = true;
          directoriesToRefresh.add(parent);
        }
      }
    }
    for (const path of directoriesToRefresh) {
      void loadDirectory(hostId, threadId, path, true);
    }
  }

  function ensureDirectoryState(key: string, path: string) {
    const existing = directories.value[key];
    if (existing) {
      return existing;
    }
    const state = directoryLoader.createState(path);
    directories.value = { ...directories.value, [key]: state };
    return state;
  }

  function invalidateGitWorkspace(hostId: number, threadId: string) {
    const scope = scopeFor(hostId, threadId);
    if (scope === null || scope.rootPath === "") return;
    gitWorkspaces.invalidate({
      hostId: scope.hostId,
      cwd: scope.rootPath,
      rootPath: scope.rootPath,
    });
  }

  function clearScopeDirectories(scope: string) {
    directories.value = Object.fromEntries(
      Object.entries(directories.value).filter(([key]) => !key.startsWith(`${scope}:`)),
    );
  }

  function resetRuntime() {
    directoryLoader.reset();
    directories.value = {};
    documentActions.resetRuntime();
    gitComparisons.reset();
    gitWorkspaces.reset();
  }

  return {
    scopes,
    workspaceOpenRequest,
    scopeFor,
    setScopeRoot,
    openFile: documentActions.openFile,
    activateFile: documentActions.activateFile,
    closeFile: documentActions.closeFile,
    documentsForScope: documentActions.documentsForScope,
    activeDocumentFor: documentActions.activeDocumentFor,
    fileForDocument: documentActions.fileForDocument,
    viewPositionFor: documentActions.viewPositionFor,
    rememberViewPosition: documentActions.rememberViewPosition,
    consumeDocumentViewRequest: documentActions.consumeDocumentViewRequest,
    restoreScope,
    reloadDocument: documentActions.reloadDocument,
    revalidateActiveFile: documentActions.revalidateActiveFile,
    loadDirectory,
    directoryFor,
    setExpandedPaths,
    revealFileInTree,
    refreshExpandedDirectories,
    deleteFile,
    markRemoteFilesChanged,
    updateDocumentDraft: updateFileDocumentDraft,
    saveDocument,
    discardDocumentDraft,
    resetRuntime,
  };
});
