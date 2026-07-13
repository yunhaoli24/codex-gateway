import { markRaw, reactive } from "vue";
import { Mutex } from "async-mutex";
import type { FilePreviewDocument } from "~~/shared/types";
import {
  fetchRemoteFile,
  RemoteFileConflictError,
  writeRemoteTextFile,
} from "@/utils/remote-file-transport";
import type { OpenWorkspaceFileInput } from "./types";
import { fileDocumentKey, fileName } from "./paths";

export function createFileDocument(input: OpenWorkspaceFileInput) {
  return reactive<FilePreviewDocument>({
    key: fileDocumentKey(input.hostId, input.threadId, input.path),
    hostId: input.hostId,
    projectId: input.projectId ?? null,
    threadId: input.threadId,
    path: input.path,
    title: fileName(input.path),
    line: input.line ?? null,
    contentType: "",
    previewKind: "text",
    size: null,
    objectUrl: "",
    savedText: "",
    draftText: "",
    dirty: false,
    saving: false,
    saveError: null,
    conflict: null,
    loading: false,
    error: null,
    updatedAt: Date.now(),
    etag: null,
    lastModified: null,
    stale: true,
  });
}

export async function loadFileDocument(document: FilePreviewDocument) {
  if (!import.meta.client) {
    return undefined;
  }
  const hasContent = Boolean(document.objectUrl);
  document.loading = !hasContent;
  document.error = null;
  try {
    const response = await fetchRemoteFile(document.hostId, document.path, document.etag);
    if (!response.changed) {
      document.stale = false;
      return undefined;
    }
    if (document.dirty) {
      document.conflict = {
        remoteEtag: response.etag ?? "",
        remoteLastModified: response.lastModified,
      };
      document.stale = false;
      return undefined;
    }
    const file = markRaw(new File([response.blob], document.title, { type: response.contentType }));
    const objectUrl = URL.createObjectURL(response.blob);
    disposeFileObjectUrl(document);
    document.contentType = response.contentType;
    document.previewKind = response.previewKind;
    document.size = response.blob.size;
    document.objectUrl = objectUrl;
    document.savedText = response.previewKind === "text" ? await response.blob.text() : "";
    document.draftText = document.savedText;
    document.dirty = false;
    document.saveError = null;
    document.conflict = null;
    document.etag = response.etag;
    document.lastModified = response.lastModified;
    document.stale = false;
    document.updatedAt = Date.now();
    return file;
  } catch (error) {
    document.error = error instanceof Error ? error.message : String(error);
    document.stale = true;
    return hasContent ? undefined : null;
  } finally {
    document.loading = false;
  }
}

const saveLocks = new Map<string, Mutex>();

export function updateFileDocumentDraft(document: FilePreviewDocument, value: string) {
  document.draftText = value;
  document.dirty = value !== document.savedText;
  if (document.dirty) document.saveError = null;
}

export async function saveFileDocument(document: FilePreviewDocument, force = false) {
  if (document.previewKind !== "text" || (!document.dirty && !force)) return true;
  const lock = saveLocks.get(document.key) ?? new Mutex();
  saveLocks.set(document.key, lock);
  return lock.runExclusive(async () => {
    if (!document.dirty && !force) return true;
    document.saving = true;
    document.saveError = null;
    const textToSave = document.draftText;
    try {
      const result = await writeRemoteTextFile(
        document.hostId,
        document.path,
        textToSave,
        document.etag,
        force,
      );
      document.savedText = textToSave;
      document.dirty = document.draftText !== textToSave;
      document.conflict = null;
      document.etag = result.etag;
      document.lastModified = result.lastModified;
      document.size = result.size;
      document.stale = false;
      return true;
    } catch (error) {
      if (error instanceof RemoteFileConflictError) {
        document.conflict = { remoteEtag: "", remoteLastModified: null };
      } else {
        document.saveError = error instanceof Error ? error.message : String(error);
      }
      return false;
    } finally {
      document.saving = false;
    }
  });
}

export async function discardFileDocumentDraft(document: FilePreviewDocument) {
  document.dirty = false;
  document.conflict = null;
  document.saveError = null;
  document.etag = null;
  document.stale = true;
  return loadFileDocument(document);
}

export function disposeFileDocument(document: FilePreviewDocument | undefined) {
  disposeFileObjectUrl(document);
  if (document) saveLocks.delete(document.key);
}

function disposeFileObjectUrl(document: FilePreviewDocument | undefined) {
  if (!document?.objectUrl) return;
  URL.revokeObjectURL(document.objectUrl);
  document.objectUrl = "";
}
