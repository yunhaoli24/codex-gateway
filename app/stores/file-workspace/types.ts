import type { RemoteDirectoryResult } from "~~/shared/types";

export interface FileWorkspaceScope {
  hostId: number;
  projectId: number | null;
  threadId: string;
  rootPath: string;
  openPaths: string[];
  activePath: string | null;
  expandedPaths: string[];
}

export interface RemoteDirectoryState extends RemoteDirectoryResult {
  loading: boolean;
  loaded: boolean;
  loadedAt: number;
  error: string | null;
  stale: boolean;
}

export interface OpenWorkspaceFileInput {
  hostId: number;
  projectId?: number | null;
  threadId: string;
  path: string;
  line?: number | null;
}
