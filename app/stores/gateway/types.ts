import type {
  AppServerThread,
  GatewayEvent,
  TerminalOpenTarget,
  TerminalSessionSnapshot,
  ThreadRuntimeStatus,
  UploadedFileRecord,
} from "~~/shared/types";

export type { ThreadRuntimeStatus };
export type HostConnectionStatus =
  | "idle"
  | "checkingVersion"
  | "upgrading"
  | "restarting"
  | "connecting"
  | "connected"
  | "failed";

export interface ThreadListResponse {
  data?: AppServerThread[];
  nextCursor?: string | null;
  backwardsCursor?: string | null;
  projects?: ProjectRecord[];
  projectDirectoryAvailability?: Record<number, ProjectDirectoryAvailability>;
}

export interface ThreadViewState {
  hostId: number;
  projectId: number | null;
  threadId: string;
  currentThread: AppServerThread | null;
  history: unknown;
  events: GatewayEvent[];
  olderTurnsCursor: string | null;
  newerTurnsCursor: string | null;
  lastEventId: number;
  loading: boolean;
  error: string | null;
}

export interface SubAgentPanelState {
  hostId: number;
  threadId: string;
  title: string;
  parentHostId: number;
  parentThreadId: string;
}

export interface ComposerDraft {
  text: string;
  attachedFiles: Array<UploadedFileRecord & { id: string; dataUrl?: string }>;
}

export interface TerminalSessionState extends TerminalSessionSnapshot {
  outputChunks: string[];
}

export interface GatewayErrorState {
  message: string;
  hostId: number | null;
  projectId: number | null;
  threadId: string | null;
  turnId: string | null;
  transient: boolean;
  updatedAt: number;
}

export interface ThreadStatusUpdateOptions {
  turnId?: string | null;
}

export type TerminalOpenInput = Omit<TerminalOpenTarget, "cols" | "rows"> & {
  cols?: number;
  rows?: number;
};
