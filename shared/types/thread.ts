import type { GatewayEvent, ProjectRecord } from "./records";

export type ThreadRuntimeStatus = "idle" | "running" | "completed" | "failed" | "interrupted";
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

export interface ThreadGoalTimelineItem {
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
  thread: unknown;
  history: unknown;
  lastEventId: number;
  runtimeStatus?: ThreadRuntimeStatus | null;
  threadSettings?: ThreadSettingsState | null;
  tokenUsage?: ThreadTokenUsageState | null;
  projectId?: number | null;
  project?: ProjectRecord | null;
  turnsPage: {
    nextCursor: string | null;
    backwardsCursor: string | null;
  };
  recentEvents: GatewayEvent[];
}

export interface ThreadTurnsPageResult {
  history: unknown;
  turnsPage: {
    nextCursor: string | null;
    backwardsCursor: string | null;
  };
}

export type ApprovalPolicy = "untrusted" | "on-request" | "never";
export type ReasoningEffort = string;

export interface ThreadSettingsState {
  model?: string | null;
  effort?: ReasoningEffort | null;
  approvalPolicy?: ApprovalPolicy | null;
}

export interface TokenUsageBreakdown {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}

export interface ThreadTokenUsageState {
  total: TokenUsageBreakdown;
  last: TokenUsageBreakdown;
  modelContextWindow: number | null;
}

export interface ComposerTurnOptions {
  model?: string | null;
  effort?: ReasoningEffort | null;
  approvalPolicy?: ApprovalPolicy | null;
  collaborationMode?: {
    mode: "default" | "plan";
    settings: {
      model: string;
      reasoningEffort?: ReasoningEffort | null;
      developerInstructions?: string | null;
    };
  } | null;
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
}
