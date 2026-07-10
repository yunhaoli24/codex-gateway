import { markRaw, reactive } from "vue";
import { isTextPreviewPath } from "~~/shared/file-preview";
import type { FilePreviewDocument } from "~~/shared/types";
import { fetchRemoteFile } from "@/utils/remote-file-transport";
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
    size: null,
    objectUrl: "",
    text: "",
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
    const file = markRaw(new File([response.blob], document.title, { type: response.contentType }));
    const objectUrl = URL.createObjectURL(response.blob);
    disposeFileDocument(document);
    document.contentType = response.contentType;
    document.size = response.blob.size;
    document.objectUrl = objectUrl;
    document.text = isTextPreviewPath(document.path, response.contentType)
      ? await response.blob.text()
      : "";
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

export function disposeFileDocument(document: FilePreviewDocument | undefined) {
  if (document?.objectUrl) {
    URL.revokeObjectURL(document.objectUrl);
    document.objectUrl = "";
  }
}
