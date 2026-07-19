import { defineStore } from "pinia";
import { shallowRef } from "vue";
import { deleteRemoteFile } from "@/utils/remote-file-transport";
import {
  discardFileDocumentDraft,
  saveFileDocument,
  updateFileDocumentDraft,
} from "./document-runtime";
import { createFileDocumentActions } from "./document-actions";
import { RemoteDirectoryLoader } from "./directory-loader";
import { createFileWorkspaceScopeState } from "./scope-state";
import {
  absolutePath,
  directoryStateKey,
  directoryPathsToFile,
  parentPath,
  parentPaths,
} from "./paths";
import type { RemoteDirectoryState } from "./types";

export { fileWorkspaceScopeKey } from "./paths";

export const useGatewayFileWorkspaceStore = defineStore(
  "gateway-file-workspace",
  () => {
    const directories = shallowRef<Record<string, RemoteDirectoryState>>({});
    const directoryLoader = new RemoteDirectoryLoader();
    const { scopes, workspaceOpenRequest, scopeFor, setScopeRoot } = createFileWorkspaceScopeState({
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
      return directoryLoader.load(state, scope.hostId, path, force);
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
      await Promise.all(added.map((path) => loadDirectory(hostId, threadId, path)));
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
      await setExpandedPaths(hostId, threadId, [
        ...new Set([...scope.expandedPaths, ...ancestors]),
      ]);
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
        scope.activePath ? parentPath(scope.activePath) : null,
        ...scope.expandedPaths,
      ].filter((path): path is string => Boolean(path));
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
    }

    function markRemoteFilesChanged(hostId: number, threadId: string, paths: string[]) {
      const scope = scopeFor(hostId, threadId);
      if (!scope) {
        return;
      }
      const directoriesToRefresh = new Set<string>();
      for (const sourcePath of paths) {
        const path = absolutePath(scope.rootPath, sourcePath);
        const document = documentActions.documentFor(hostId, threadId, path);
        if (document) {
          document.stale = true;
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

    function clearScopeDirectories(scope: string) {
      directories.value = Object.fromEntries(
        Object.entries(directories.value).filter(([key]) => !key.startsWith(`${scope}:`)),
      );
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
      saveDocument: saveFileDocument,
      discardDocumentDraft: discardFileDocumentDraft,
    };
  },
  {
    persist: {
      pick: ["scopes"],
      storage: piniaPluginPersistedstate.localStorage(),
    },
  },
);
