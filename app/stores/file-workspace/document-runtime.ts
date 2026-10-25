import { markRaw, reactive } from "vue";
import { Mutex } from "async-mutex";
import type { FilePreviewDocument } from "~~/shared/types";
import { useAuthStore } from "@/stores/auth";
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
    cwd: input.cwd ?? null,
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
    requestedView: input.view ?? null,
  });
}

export async function loadFileDocument(document: FilePreviewDocument, signal?: AbortSignal) {
  if (!import.meta.client) {
    return undefined;
  }
  const hasContent = Boolean(document.objectUrl);
  const auth = useAuthStore();
  const sessionEpoch = auth.sessionEpoch;
  const requestedEtag = document.etag;
  document.loading = !hasContent;
  document.error = null;
  try {
    const response = await fetchRemoteFile(document.hostId, document.path, requestedEtag, signal);
    if (!auth.isCurrentSession(sessionEpoch) || isAborted(signal)) return undefined;
    // A save can finish while SFTP is reading. Its newer ETag owns the document; never apply the
    // older response over a successfully saved draft.
    if (document.etag !== requestedEtag) return undefined;
    if (!response.changed) {
      document.stale = false;
      return undefined;
    }
    const savedText = response.previewKind === "text" ? await response.blob.text() : "";
    if (!auth.isCurrentSession(sessionEpoch) || isAborted(signal)) return undefined;
    if (document.etag !== requestedEtag) return undefined;
    // Check after decoding as well as downloading: the user may have started typing meanwhile.
    if (document.dirty) {
      document.conflict = {
        remoteEtag: response.etag ?? "",
        remoteLastModified: response.lastModified,
      };
      document.stale = false;
      return undefined;
    }
    const file = markRaw(new File([response.blob], document.title, { type: response.contentType }));
    // Create the URL only after asynchronous text decoding and the cancellation check. Creating
    // it earlier lets a close/reload during blob.text() orphan a URL that no document can revoke.
    const objectUrl = URL.createObjectURL(response.blob);
    disposeFileObjectUrl(document);
    document.contentType = response.contentType;
    document.previewKind = response.previewKind;
    document.size = response.blob.size;
    document.objectUrl = objectUrl;
    document.savedText = savedText;
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
    if (isAborted(signal)) return undefined;
    document.error = error instanceof Error ? error.message : String(error);
    document.stale = true;
    return hasContent ? undefined : null;
  } finally {
    document.loading = false;
  }
}

function isAborted(signal: AbortSignal | undefined) {
  // Keep each check live across await boundaries. TypeScript may otherwise retain a previous
  // `signal.aborted === false` narrowing even though AbortSignal is mutable external state.
  return signal?.aborted ?? false;
}

const saveLocks = new Map<string, Mutex>();

export function updateFileDocumentDraft(document: FilePreviewDocument, value: string) {
  document.draftText = value;
  document.dirty = value !== document.savedText;
  if (document.dirty) document.saveError = null;
}

export async function saveFileDocument(document: FilePreviewDocument, force = false) {
  if (document.previewKind !== "text" || (!document.dirty && !force)) {
    return { ok: true, wrote: false } as const;
  }
  const lock = saveLocks.get(document.key) ?? new Mutex();
  saveLocks.set(document.key, lock);
  return lock.runExclusive(async () => {
    if (!document.dirty && !force) return { ok: true, wrote: false } as const;
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
      return { ok: true, wrote: true } as const;
    } catch (error) {
      if (error instanceof RemoteFileConflictError) {
        document.conflict = { remoteEtag: "", remoteLastModified: null };
      } else {
        document.saveError = error instanceof Error ? error.message : String(error);
      }
      return { ok: false, wrote: false } as const;
    } finally {
      document.saving = false;
    }
  });
}

export function discardFileDocumentDraft(document: FilePreviewDocument) {
  document.dirty = false;
  document.conflict = null;
  document.saveError = null;
  document.etag = null;
  document.stale = true;
  // The workspace loader owns every document read, including discarding a conflicted draft.
  // Starting a second independent read here would race automatic refresh and bypass its queue.
}

export function disposeFileDocument(document: FilePreviewDocument | undefined) {
  disposeFileObjectUrl(document);
  if (document !== undefined) saveLocks.delete(document.key);
}

function disposeFileObjectUrl(document: FilePreviewDocument | undefined) {
  if (document?.objectUrl === undefined || document.objectUrl === "") return;
  URL.revokeObjectURL(document.objectUrl);
  document.objectUrl = "";
}
