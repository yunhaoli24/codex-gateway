import type {
  ApprovalPolicy,
  GatewayEvent,
  HostRecord,
  ReasoningEffort,
  ThreadSettingsState,
  ThreadTokenUsageState,
} from "~~/shared/types";

export type Subscriber = (event: GatewayEvent) => void;
export type CloseSubscriber = () => void;

export const DEFAULT_TURN_PAGE_LIMIT = 20;

export interface TurnsPage {
  data?: any[];
  nextCursor?: string | null;
  backwardsCursor?: string | null;
}

export interface ThreadOpenSnapshot {
  thread: any;
  history: any;
  projectId: number | null;
  turnsPage: {
    nextCursor: string | null;
    backwardsCursor: string | null;
  };
  threadSettings: ThreadSettingsState;
  tokenUsage: ThreadTokenUsageState | null;
}

export interface TurnStartInput {
  text: string;
  cwd?: string | null;
  clientUserMessageId?: string | null;
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

export interface TurnSteerInput {
  text: string;
  expectedTurnId: string;
  clientUserMessageId?: string | null;
  images?: Array<{
    path?: string;
    url?: string;
    detail?: "low" | "high" | "auto" | "original";
  }>;
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
  handleNotification(message: any): void;
  handleStderr(text: string): void;
}
