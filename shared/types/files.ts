export interface RemoteDirectoryEntry {
  name: string;
  path: string;
  type: "directory" | "file" | "other";
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
