export type HostAuthMode = "agent" | "privateKey" | "password";

export interface HostRecord {
  id: number;
  name: string;
  sshHost: string;
  username: string | null;
  port: number | null;
  authMode: HostAuthMode;
  privateKeyPath: string | null;
  privateKey?: string | null;
  password?: string | null;
  proxyUrl: string | null;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRecord {
  id: number;
  hostId: number;
  name: string;
  remotePath: string;
  createdAt: string;
  updatedAt: string;
}

export interface HostCreateInput {
  name: string;
  sshHost: string;
  username?: string | null;
  port?: number | null;
  authMode: HostAuthMode;
  privateKeyPath?: string | null;
  privateKey?: string | null;
  password?: string | null;
  proxyUrl?: string | null;
}

export type HostUpdateInput = HostCreateInput;

export interface ProjectCreateInput {
  hostId: number;
  name: string;
  remotePath: string;
}

export type ProjectUpdateInput = ProjectCreateInput;

export interface RpcEnvelope {
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface GatewayEvent {
  id: number;
  hostId: number;
  threadId: string;
  method: string;
  payload: RpcEnvelope;
  createdAt: string;
}

export type ThreadRuntimeStatus = "idle" | "running" | "completed" | "failed" | "interrupted";

export type TerminalScope = "host" | "project" | "thread";

export interface TerminalOpenTarget {
  hostId: number;
  projectId?: number | null;
  threadId?: string | null;
  cwd?: string | null;
  title?: string | null;
  scope: TerminalScope;
  cols: number;
  rows: number;
}

export interface TerminalSessionSnapshot {
  sessionId: string;
  hostId: number;
  projectId: number | null;
  threadId: string | null;
  cwd: string | null;
  title: string;
  scope: TerminalScope;
  cols: number;
  rows: number;
  createdAt: string;
  lastActiveAt: string;
  status: "open" | "closed";
  output: string;
}

export type RealtimeClientMessage =
  | {
      type: "auth.authenticate";
      token: string;
    }
  | {
      type: "host.lifecycle.subscribe";
    }
  | {
      type: "host.lifecycle.unsubscribe";
    }
  | {
      type: "thread.activate";
      requestId: string;
      hostId: number;
      projectId?: number | null;
      threadId: string;
      limit?: number;
    }
  | {
      type: "thread.subscribe";
      hostId: number;
      threadId: string;
      afterId?: number;
    }
  | {
      type: "thread.unsubscribe";
      hostId: number;
      threadId: string;
    }
  | {
      type: "turn.start";
      requestId: string;
      hostId: number;
      threadId: string;
      text: string;
      clientUserMessageId?: string | null;
      cwd?: string | null;
      model?: string | null;
      effort?: ReasoningEffort | null;
      approvalPolicy?: ApprovalPolicy | null;
      collaborationMode?: ComposerTurnOptions["collaborationMode"];
      images?: ComposerTurnOptions["images"];
      files?: ComposerTurnOptions["files"];
    }
  | {
      type: "turn.steer";
      requestId: string;
      hostId: number;
      threadId: string;
      expectedTurnId: string;
      text: string;
      clientUserMessageId?: string | null;
      images?: Array<{
        path?: string;
        url?: string;
        detail?: "low" | "high" | "auto" | "original";
      }>;
    }
  | {
      type: "turn.interrupt";
      requestId: string;
      hostId: number;
      threadId: string;
      turnId: string;
    }
  | {
      type: "serverRequest.respond";
      requestId: string;
      hostId: number;
      threadId: string;
      serverRequestId: string | number;
      result?: unknown;
      error?: {
        code: number;
        message: string;
        data?: unknown;
      };
    }
  | ({
      type: "terminal.open";
      requestId: string;
    } & TerminalOpenTarget)
  | {
      type: "terminal.list";
      requestId: string;
    }
  | {
      type: "terminal.input";
      sessionId: string;
      data: string;
    }
  | {
      type: "terminal.resize";
      sessionId: string;
      cols: number;
      rows: number;
    }
  | {
      type: "terminal.close";
      requestId: string;
      sessionId: string;
    }
  | {
      type: "ping";
      nonce?: string;
    };

export type RealtimeServerMessage =
  | {
      type: "ready";
      connectionId: string;
    }
  | {
      type: "host.lifecycle";
      event: {
        hostId: number;
        status:
          | "checkingVersion"
          | "upgrading"
          | "restarting"
          | "connecting"
          | "connected"
          | "failed";
        message: string;
        createdAt?: string;
      };
    }
  | {
      type: "thread.event";
      event: GatewayEvent;
    }
  | ({
      type: "thread.snapshot";
      requestId: string;
      hostId: number;
      threadId: string;
      lastEventId: number;
    } & ThreadOpenResult)
  | {
      type: "turn.start.accepted";
      requestId: string;
      hostId: number;
      threadId: string;
      turn?: any;
    }
  | {
      type: "turn.steer.accepted";
      requestId: string;
      hostId: number;
      threadId: string;
      turnId?: string;
    }
  | {
      type: "turn.interrupt.accepted";
      requestId: string;
      hostId: number;
      threadId: string;
    }
  | {
      type: "serverRequest.respond.accepted";
      requestId: string;
      hostId: number;
      threadId: string;
      serverRequestId: string | number;
    }
  | {
      type: "terminal.opened";
      requestId: string;
      session: TerminalSessionSnapshot;
    }
  | {
      type: "terminal.snapshot";
      requestId: string;
      sessions: TerminalSessionSnapshot[];
    }
  | {
      type: "terminal.closed";
      requestId: string;
      sessionId: string;
    }
  | {
      type: "terminal.closed.event";
      sessionId: string;
    }
  | {
      type: "terminal.output";
      sessionId: string;
      data: string;
      seq: number;
      createdAt: string;
    }
  | {
      type: "terminal.exited";
      sessionId: string;
      code: number | null;
      signal: string | null;
      createdAt: string;
    }
  | {
      type: "terminal.error";
      sessionId?: string;
      message: string;
      requestId?: string;
    }
  | {
      type: "error";
      message: string;
      requestId?: string;
      request?: RealtimeClientMessage;
      code?: string;
      details?: Record<string, unknown>;
    }
  | {
      type: "pong";
      nonce?: string;
    };

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

export interface ModelRecord {
  id: string;
  model: string;
  displayName: string;
  description?: string | null;
  hidden?: boolean;
  isDefault?: boolean;
  defaultReasoningEffort?: string | null;
  supportedReasoningEfforts?: Array<{
    reasoningEffort: string;
    description?: string | null;
  }>;
  inputModalities?: string[];
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

export interface ModelListResult {
  data: ModelRecord[];
  nextCursor?: string | null;
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

export interface GatewayStatus {
  hosts: number;
  projects: number;
  activeControllers: Array<{
    hostId: number;
    threadId: string;
  }>;
}

export interface RemoteDirectoryEntry {
  name: string;
  path: string;
  type: "directory" | "file" | "other";
}

export interface PinnedThreadRecord {
  hostId: number;
  projectId: number | null;
  threadId: string;
  title: string;
  subtitle?: string | null;
  projectName?: string | null;
  updatedAt?: number | null;
}

export interface BarkNotificationSettings {
  enabled: boolean;
  serverUrl: string;
  deviceKey: string;
  group?: string | null;
}

export interface GatewayNotificationSettings {
  bark: BarkNotificationSettings;
}

export interface GatewayConfig {
  version: 1;
  hosts: HostRecord[];
  projects: ProjectRecord[];
  pinnedThreads: PinnedThreadRecord[];
  notifications: GatewayNotificationSettings;
  lastOpenThread?: {
    hostId: number;
    projectId: number | null;
    threadId: string;
  } | null;
}
