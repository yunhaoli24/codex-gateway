export interface RemoteDirectoryEntry {
  name: string;
  path: string;
  type: "directory" | "file" | "other";
  size: number | null;
  modifiedAt: number | null;
}

export interface RemoteDirectoryResult {
  path: string;
  entries: RemoteDirectoryEntry[];
}

export interface UploadedFileRecord {
  name: string;
  path: string;
  mimeType?: string | null;
  size: number;
  isImage: boolean;
}

export interface UploadResult {
  files: UploadedFileRecord[];
}

export interface FilePreviewDocument {
  key: string;
  hostId: number;
  projectId: number | null;
  threadId: string;
  path: string;
  title: string;
  line: number | null;
  contentType: string;
  previewKind: "text" | "binary" | "document";
  size: number | null;
  objectUrl: string;
  savedText: string;
  draftText: string;
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
  conflict: RemoteFileConflict | null;
  loading: boolean;
  error: string | null;
  updatedAt: number;
  etag: string | null;
  lastModified: string | null;
  stale: boolean;
}

export interface RemoteFileConflict {
  remoteEtag: string;
  remoteLastModified: string | null;
}

export interface RemoteFileWriteResult {
  etag: string;
  lastModified: string;
  size: number;
}
