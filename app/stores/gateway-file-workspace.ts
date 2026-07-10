import { defineStore } from "pinia";
import { reactive, shallowRef } from "vue";
import type { FilePreviewDocument } from "~~/shared/types";
import {
  createFileDocument,
  disposeFileDocument,
  loadFileDocument,
} from "./file-workspace/document-runtime";
import { createDirectoryState, loadDirectoryState } from "./file-workspace/directory-runtime";
import {
  absolutePath,
  directoryStateKey,
  fileDocumentKey,
  fileWorkspaceScopeKey,
  parentPath,
  parentPaths,
} from "./file-workspace/paths";
import type {
  FileWorkspaceScope,
  OpenWorkspaceFileInput,
  RemoteDirectoryState,
} from "./file-workspace/types";

export { fileWorkspaceScopeKey } from "./file-workspace/paths";

export const useGatewayFileWorkspaceStore = defineStore(
  "gateway-file-workspace",
  () => {
    const scopes = ref<Record<string, FileWorkspaceScope>>({});
    const documents = shallowRef<Record<string, FilePreviewDocument>>({});
    const filesByKey = shallowRef<Record<string, File | null>>({});
    const directories = shallowRef<Record<string, RemoteDirectoryState>>({});
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
          clearScopeDirectories(key);
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

    async function openFile(input: OpenWorkspaceFileInput) {
      const scope = ensureScope(input);
      if (!scope.openPaths.includes(input.path)) {
        scope.openPaths = [...scope.openPaths, input.path];
      }
      scope.activePath = input.path;
      workspaceOpenRequest.value = {
        scopeKey: fileWorkspaceScopeKey(input.hostId, input.threadId),
        sequence: (workspaceOpenRequest.value?.sequence ?? 0) + 1,
      };
      const document = ensureDocument(input);
      document.line = input.line ?? document.line;
      document.updatedAt = Date.now();
      if (!document.objectUrl && !document.loading) {
        await loadDocument(document);
      }
    }

    function activateFile(hostId: number, threadId: string, path: string) {
      const scope = scopeFor(hostId, threadId);
      if (!scope?.openPaths.includes(path)) {
        return;
      }
      scope.activePath = path;
      const document = documentFor(hostId, threadId, path);
      if (document && (document.stale || !document.objectUrl) && !document.loading) {
        void loadDocument(document);
      }
    }

    function closeFile(hostId: number, threadId: string, path: string) {
      const scope = scopeFor(hostId, threadId);
      if (!scope) {
        return;
      }
      const index = scope.openPaths.indexOf(path);
      if (index < 0) {
        return;
      }
      const key = fileDocumentKey(hostId, threadId, path);
      disposeFileDocument(documents.value[key]);
      const nextDocuments = { ...documents.value };
      const nextFiles = { ...filesByKey.value };
      delete nextDocuments[key];
      delete nextFiles[key];
      documents.value = nextDocuments;
      filesByKey.value = nextFiles;
      scope.openPaths = scope.openPaths.filter((candidate) => candidate !== path);
      if (scope.activePath === path) {
        scope.activePath = scope.openPaths[Math.min(index, scope.openPaths.length - 1)] ?? null;
      }
    }

    function documentsForScope(hostId: number, threadId: string) {
      const scope = scopeFor(hostId, threadId);
      if (!scope) {
        return [];
      }
      return scope.openPaths.map((path) => ensureDocument({ hostId, threadId, path }));
    }

    function activeDocumentFor(hostId: number, threadId: string) {
      const path = scopeFor(hostId, threadId)?.activePath;
      return path ? documentFor(hostId, threadId, path) : null;
    }

    function documentFor(hostId: number, threadId: string, path: string) {
      return documents.value[fileDocumentKey(hostId, threadId, path)] ?? null;
    }

    function fileForDocument(key: string) {
      return filesByKey.value[key] ?? null;
    }

    async function restoreScope(hostId: number, threadId: string) {
      const scope = scopeFor(hostId, threadId);
      if (!scope) {
        return;
      }
      for (const path of scope.openPaths) {
        ensureDocument({ hostId, projectId: scope.projectId, threadId, path });
      }
      if (scope.activePath) {
        activateFile(hostId, threadId, scope.activePath);
      }
      await refreshExpandedDirectories(hostId, threadId, false);
    }

    async function reloadDocument(document: FilePreviewDocument) {
      document.stale = true;
      await loadDocument(document);
    }

    async function revalidateActiveFile(hostId: number, threadId: string) {
      const document = activeDocumentFor(hostId, threadId);
      if (document && !document.loading) {
        await loadDocument(document);
      }
    }

    async function loadDirectory(hostId: number, threadId: string, path: string, force = false) {
      const scope = scopeFor(hostId, threadId);
      if (!scope) {
        return null;
      }
      const key = directoryStateKey(hostId, threadId, path);
      const state = ensureDirectoryState(key, path);
      return loadDirectoryState(state, scope.hostId, path, force);
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

    async function refreshExpandedDirectories(hostId: number, threadId: string, force = true) {
      const scope = scopeFor(hostId, threadId);
      if (!scope) {
        return;
      }
      await Promise.all(
        scope.expandedPaths.map((path) => loadDirectory(hostId, threadId, path, force)),
      );
    }

    function markRemoteFilesChanged(hostId: number, threadId: string, paths: string[]) {
      const scope = scopeFor(hostId, threadId);
      if (!scope) {
        return;
      }
      const directoriesToRefresh = new Set<string>();
      for (const sourcePath of paths) {
        const path = absolutePath(scope.rootPath, sourcePath);
        const document = documentFor(hostId, threadId, path);
        if (document) {
          document.stale = true;
          document.etag = null;
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

    async function loadDocument(document: FilePreviewDocument) {
      const file = await loadFileDocument(document);
      if (file !== undefined) {
        filesByKey.value = { ...filesByKey.value, [document.key]: file };
      }
    }

    function ensureScope(input: OpenWorkspaceFileInput) {
      const existing = scopeFor(input.hostId, input.threadId);
      if (existing) {
        return existing;
      }
      return setScopeRoot({
        hostId: input.hostId,
        projectId: input.projectId ?? null,
        threadId: input.threadId,
        rootPath: parentPath(input.path),
      });
    }

    function ensureDocument(input: OpenWorkspaceFileInput) {
      const key = fileDocumentKey(input.hostId, input.threadId, input.path);
      const existing = documents.value[key];
      if (existing) {
        return existing;
      }
      const document = createFileDocument(input);
      documents.value = { ...documents.value, [key]: document };
      return document;
    }

    function ensureDirectoryState(key: string, path: string) {
      const existing = directories.value[key];
      if (existing) {
        return existing;
      }
      const state = createDirectoryState(path);
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
      openFile,
      activateFile,
      closeFile,
      documentsForScope,
      activeDocumentFor,
      fileForDocument,
      restoreScope,
      reloadDocument,
      revalidateActiveFile,
      loadDirectory,
      directoryFor,
      setExpandedPaths,
      refreshExpandedDirectories,
      markRemoteFilesChanged,
    };
  },
  {
    persist: {
      pick: ["scopes"],
      storage: piniaPluginPersistedstate.localStorage(),
    },
  },
);
