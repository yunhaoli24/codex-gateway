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
  size: number | null;
  objectUrl: string;
  text: string;
  loading: boolean;
  error: string | null;
  updatedAt: number;
  etag: string | null;
  lastModified: string | null;
  stale: boolean;
}
