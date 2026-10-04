import type {
  AppServerThread,
  ApprovalPolicy,
  HostRecord,
  ReasoningEffort,
  ReasoningSummary,
  ThreadCollaborationMode,
  ThreadSettingsState,
  ThreadTokenUsageState,
  ThreadTimelineHistoryState,
  RpcEnvelope,
} from "~~/shared/types";

export const DEFAULT_TIMELINE_PAGE_LIMIT = 100;

export interface ThreadOpenSnapshot {
  thread: AppServerThread;
  /** Materialized once at the app-server/event boundary; cache hits return this object directly. */
  history: ThreadTimelineHistoryState;
  oldestTimelineCursor: string | null;
  projectId: number | null;
  /** Null when a metadata-only thread/read cannot expose persisted model settings. */
  threadSettings: ThreadSettingsState | null;
  tokenUsage: ThreadTokenUsageState | null;
}

export interface TurnStartInput {
  text: string;
  cwd?: string | null;
  clientUserMessageId?: string | null;
  model?: string | null;
  effort?: ReasoningEffort | null;
  summary?: ReasoningSummary | null;
  approvalPolicy?: ApprovalPolicy | null;
  collaborationMode?: ThreadCollaborationMode | null;
  images?: Array<{
    path?: string;
    url?: string;
    detail?: "low" | "high" | "auto" | "original";
  }>;
  files?: Array<{
    path: string;
    name: string;
    mimeType?: string | null;
    size: number;
    isImage: boolean;
  }>;
  additionalContext?: Record<string, { value: string; kind: "untrusted" | "application" }>;
}

export interface TurnSteerInput {
  text: string;
  expectedTurnId: string;
  clientUserMessageId?: string | null;
  images?: Array<{
    path?: string;
    url?: string;
    detail?: "low" | "high" | "auto" | "original";
  }>;
  additionalContext?: Record<string, { value: string; kind: "untrusted" | "application" }>;
}

export interface ServerRequestResponseInput {
  requestId: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type HostControllerLookup = (
  hostId: number,
  threadId: string,
) => ThreadControllerLike | null;
export type HostControllersLookup = (hostId: number) => ThreadControllerLike[];

export interface ThreadControllerLike {
  readonly host: HostRecord;
  readonly threadId: string;
  handleNotification(message: RpcEnvelope): void;
  handleStderr(text: string): void;
}
