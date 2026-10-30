import type {
  GatewayThread,
  GatewayEvent,
  ThreadTimelineHistoryState,
  TerminalOpenTarget,
  TerminalSessionSnapshot,
  ThreadRuntimeStatus,
  UploadedFileRecord,
  FileReference,
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
}

export interface ThreadViewState {
  hostId: number;
  cwd: string | null;
  threadId: string;
  currentThread: GatewayThread | null;
  history: ThreadTimelineHistoryState | null;
  events: GatewayEvent[];
  oldestTimelineCursor: string | null;
  lastEventId: number;
  /** Highest event id already reduced into this view's history. */
  appliedEventId?: number;
  eventEpoch: string;
  loading: boolean;
  error: string | null;
  readOnly?: boolean;
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
  cwd: string | null;
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
