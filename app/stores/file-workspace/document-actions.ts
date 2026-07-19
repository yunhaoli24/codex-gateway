import { ref, shallowRef, type Ref } from "vue";
import type { FilePreviewDocument } from "~~/shared/types";
import {
  createFileDocument,
  disposeFileDocument,
  loadFileDocument,
  saveFileDocument,
} from "./document-runtime";
import { fileDocumentKey, fileWorkspaceScopeKey, parentPath } from "./paths";
import type { FileWorkspaceScope, OpenWorkspaceFileInput } from "./types";

interface FileDocumentActionsOptions {
  scopeFor: (hostId: number, threadId: string) => FileWorkspaceScope | null;
  setScopeRoot: (input: {
    hostId: number;
    projectId: number | null;
    threadId: string;
    rootPath: string;
  }) => FileWorkspaceScope;
  workspaceOpenRequest: Ref<{ scopeKey: string; sequence: number } | null>;
}

/** Owns open-file documents and their page-session view positions. Directory state deliberately
 * lives elsewhere so tree refreshes cannot invalidate editor/document state. */
export function createFileDocumentActions(options: FileDocumentActionsOptions) {
  const documents = shallowRef<Record<string, FilePreviewDocument>>({});
  const filesByKey = shallowRef<Record<string, File | null>>({});
  const viewPositions = ref<Record<string, { left: number; top: number }>>({});

  async function openFile(input: OpenWorkspaceFileInput) {
    const scope = ensureScope(input);
    if (!scope.openPaths.includes(input.path)) scope.openPaths = [...scope.openPaths, input.path];
    scope.activePath = input.path;
    options.workspaceOpenRequest.value = {
      scopeKey: fileWorkspaceScopeKey(input.hostId, input.threadId),
      sequence: (options.workspaceOpenRequest.value?.sequence ?? 0) + 1,
    };
    const document = ensureDocument(input);
    document.line = input.line ?? document.line;
    document.updatedAt = Date.now();
    if (!document.objectUrl && !document.loading) await loadDocument(document);
  }

  async function activateFile(hostId: number, threadId: string, path: string) {
    const scope = options.scopeFor(hostId, threadId);
    if (!scope?.openPaths.includes(path)) return;
    const current = activeDocumentFor(hostId, threadId);
    if (current?.dirty) await saveFileDocument(current);
    scope.activePath = path;
    const document = documentFor(hostId, threadId, path);
    if (document && (document.stale || !document.objectUrl) && !document.loading) {
      await loadDocument(document);
    }
  }

  function closeFile(hostId: number, threadId: string, path: string) {
    const scope = options.scopeFor(hostId, threadId);
    if (!scope) return;
    const index = scope.openPaths.indexOf(path);
    if (index < 0) return;
    const key = fileDocumentKey(hostId, threadId, path);
    disposeFileDocument(documents.value[key]);
    const nextDocuments = { ...documents.value };
    const nextFiles = { ...filesByKey.value };
    delete nextDocuments[key];
    delete nextFiles[key];
    documents.value = nextDocuments;
    filesByKey.value = nextFiles;
    viewPositions.value = Object.fromEntries(
      Object.entries(viewPositions.value).filter(
        ([positionKey]) => !positionKey.startsWith(`${key}:`),
      ),
    );
    scope.openPaths = scope.openPaths.filter((candidate) => candidate !== path);
    if (scope.activePath === path) {
      scope.activePath = scope.openPaths[Math.min(index, scope.openPaths.length - 1)] ?? null;
    }
  }

  function documentsForScope(hostId: number, threadId: string) {
    const scope = options.scopeFor(hostId, threadId);
    if (!scope) return [];
    return scope.openPaths
      .map((path) => documentFor(hostId, threadId, path))
      .filter((document): document is FilePreviewDocument => Boolean(document));
  }

  function activeDocumentFor(hostId: number, threadId: string) {
    const path = options.scopeFor(hostId, threadId)?.activePath;
    return path ? documentFor(hostId, threadId, path) : null;
  }

  function documentFor(hostId: number, threadId: string, path: string) {
    return documents.value[fileDocumentKey(hostId, threadId, path)] ?? null;
  }

  function fileForDocument(key: string) {
    return filesByKey.value[key] ?? null;
  }

  function viewPositionFor(documentKey: string, view: "source" | "markdown") {
    return viewPositions.value[`${documentKey}:${view}`] ?? { left: 0, top: 0 };
  }

  function rememberViewPosition(
    documentKey: string,
    view: "source" | "markdown",
    position: { left: number; top: number },
  ) {
    viewPositions.value = { ...viewPositions.value, [`${documentKey}:${view}`]: position };
  }

  async function restoreScopeDocuments(hostId: number, threadId: string) {
    const scope = options.scopeFor(hostId, threadId);
    if (!scope) return;
    for (const path of scope.openPaths) {
      ensureDocument({ hostId, projectId: scope.projectId, threadId, path });
    }
    if (scope.activePath) await activateFile(hostId, threadId, scope.activePath);
  }

  async function reloadDocument(document: FilePreviewDocument) {
    document.stale = true;
    await loadDocument(document);
  }

  async function revalidateActiveFile(hostId: number, threadId: string) {
    const document = activeDocumentFor(hostId, threadId);
    if (document && !document.loading) await loadDocument(document);
  }

  async function loadDocument(document: FilePreviewDocument) {
    const file = await loadFileDocument(document);
    if (file !== undefined) filesByKey.value = { ...filesByKey.value, [document.key]: file };
  }

  function ensureScope(input: OpenWorkspaceFileInput) {
    return (
      options.scopeFor(input.hostId, input.threadId) ??
      options.setScopeRoot({
        hostId: input.hostId,
        projectId: input.projectId ?? null,
        threadId: input.threadId,
        rootPath: parentPath(input.path),
      })
    );
  }

  function ensureDocument(input: OpenWorkspaceFileInput) {
    const key = fileDocumentKey(input.hostId, input.threadId, input.path);
    const existing = documents.value[key];
    if (existing) return existing;
    const document = createFileDocument(input);
    documents.value = { ...documents.value, [key]: document };
    return document;
  }

  return {
    openFile,
    activateFile,
    closeFile,
    documentsForScope,
    activeDocumentFor,
    documentFor,
    fileForDocument,
    viewPositionFor,
    rememberViewPosition,
    restoreScopeDocuments,
    reloadDocument,
    revalidateActiveFile,
    ensureDocument,
  };
}
