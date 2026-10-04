import type { GatewayEvent, ProjectRecord } from "./records";
import type { ThreadTimelineHistoryState } from "../thread-history/types";
import type { AgentProviderId } from "../agent/providers";
import type { AppServerThread } from "../runtime/app-server";
import type { ReasoningSummary } from "../reasoning-summary";

export type { ReasoningSummary } from "../reasoning-summary";

export type {
  AppServerSessionSource,
  AppServerSubAgentSource,
  AppServerThread,
  AppServerThreadSection,
  AppServerThreadStatus,
  AppServerTurn,
  AppServerTimelineEntry,
  AppServerTimelinePage,
  CodexErrorInfo,
  MisalignmentErrorDetails,
} from "../runtime/app-server";

export type ThreadRuntimeStatus = "idle" | "running" | "completed" | "failed" | "interrupted";

export interface ThreadRuntimeStatusUpdate {
  hostId: number;
  threadId: string;
  status: ThreadRuntimeStatus;
  turnId?: string | null;
}
export type ThreadGoalStatus =
  | "active"
  | "paused"
  | "blocked"
  | "usageLimited"
  | "budgetLimited"
  | "complete";

export interface ThreadGoal {
  threadId: string;
  objective: string;
  status: ThreadGoalStatus;
  tokenBudget: number | null;
  tokensUsed: number;
  timeUsedSeconds: number;
  createdAt: number;
  updatedAt: number;
}

export interface ThreadGoalTimelineItem extends Record<string, unknown> {
  type: "threadGoal";
  id: string;
  turnId?: string | null;
  threadId: string;
  objective: string;
  status: ThreadGoalStatus;
  tokenBudget: number | null;
  tokensUsed: number;
  timeUsedSeconds: number;
  createdAt: number;
  updatedAt: number;
}

export interface ThreadOpenResult {
  hostId: number;
  thread: GatewayThread;
  history: ThreadTimelineHistoryState;
  lastEventId: number;
  eventEpoch: string;
  runtimeStatus?: ThreadRuntimeStatus | null;
  threadSettings?: ThreadSettingsState | null;
  tokenUsage?: ThreadTokenUsageState | null;
  projectId?: number | null;
  project?: ProjectRecord | null;
  /** Cursor for the oldest currently cached timeline page; null means no older page exists. */
  oldestTimelineCursor: string | null;
  recentEvents: GatewayEvent[];
}

/** Persisted by the official app-server thread attachment store. */
export interface ThreadAttachment {
  id: string;
  attachmentType: string;
  identityKey: string;
  payload: unknown;
  createdAt: number;
}

export interface ThreadAttachmentsPage {
  data: ThreadAttachment[];
  nextCursor: string | null;
}

export type ApprovalPolicy = "untrusted" | "on-request" | "never";
export type ReasoningEffort = string;

export interface ThreadCollaborationMode {
  mode: "default" | "plan";
  settings: {
    model: string;
    reasoningEffort?: ReasoningEffort | null;
    developerInstructions?: string | null;
  };
}

export interface ThreadSettingsState {
  model?: string | null;
  effort?: ReasoningEffort | null;
  summary?: ReasoningSummary | null;
  approvalPolicy?: ApprovalPolicy | null;
  collaborationMode?: ThreadCollaborationMode | null;
}

export interface TokenUsageBreakdown {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}

/** Browser/server projection with user-scoped Gateway navigation metadata. */
export type GatewayThread = Omit<AppServerThread, "projectId"> & {
  /** App-server's global experimental project identity; never use it as a Gateway SQLite id. */
  appServerProjectId: string | null;
  hostId: number;
  projectId: number | null;
  pinned: boolean;
  title: string | null;
};

export interface ThreadTokenUsageState {
  total: TokenUsageBreakdown;
  last: TokenUsageBreakdown;
  modelContextWindow: number | null;
}

export interface FileReference {
  type: "file";
  /** Normalized path relative to the selected project root. */
  path: string;
  name: string;
}

export interface ComposerTurnOptions {
  provider?: AgentProviderId;
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
  references?: FileReference[];
}
