import type {
  GatewayThread,
  GatewayEvent,
  ThreadHistoryState,
  ThreadTimelineTurn,
  TerminalOpenTarget,
  TerminalSessionSnapshot,
  ThreadRuntimeStatus,
  UploadedFileRecord,
  FileReference,
  ProjectDirectoryAvailability,
  ProjectRecord,
} from "~~/shared/types";

export type { ThreadRuntimeStatus };
export type HostConnectionStatus =
  | "idle"
  | "checkingVersion"
  | "upgrading"
  | "restarting"
  | "connecting"
  | "mfaConnecting"
  | "connected"
  | "failed"
  | "mfaRequired";

export interface ThreadListResponse {
  data?: GatewayThread[];
  nextCursor?: string | null;
  backwardsCursor?: string | null;
  projects?: ProjectRecord[];
  projectDirectoryAvailability?: Record<number, ProjectDirectoryAvailability>;
}

export interface ThreadViewState {
  hostId: number;
  projectId: number | null;
  threadId: string;
  currentThread: GatewayThread | null;
  history: ThreadHistoryState | null;
  timelineTurns: ThreadTimelineTurn[];
  events: GatewayEvent[];
  olderTurnsCursor: string | null;
  newerTurnsCursor: string | null;
  lastEventId: number;
  eventEpoch: string;
  loading: boolean;
  error: string | null;
}

export interface SubAgentPanelState {
  hostId: number;
  threadId: string;
  /** Optional human-readable candidate; machine thread IDs are never stored as titles. */
  title: string | null;
  parentHostId: number;
  parentThreadId: string;
}

export interface ComposerDraft {
  text: string;
  attachedFiles: Array<UploadedFileRecord & { id: string; dataUrl?: string }>;
  fileReferences: ComposerFileReference[];
}

export interface ComposerFileReference extends FileReference {
  id: string;
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
