import type {
  GatewayConfig,
  GatewayEvent,
  GatewayStatus,
  HostRecord,
  ModelRecord,
  PinnedThreadRecord,
  ProjectRecord,
  ComposerTurnOptions,
  ThreadSettingsState,
  ThreadTokenUsageState,
  UploadedFileRecord,
} from "~~/shared/types";
import type { GatewayDomainEvents } from "./domain-events";
import type { ErrorMessageLabels } from "./thread-utils/identity";

export type ThreadRuntimeStatus = "idle" | "running" | "completed" | "failed" | "interrupted";
export type HostConnectionStatus =
  | "idle"
  | "checkingVersion"
  | "upgrading"
  | "restarting"
  | "connecting"
  | "connected"
  | "failed";

export interface ThreadListResponse {
  data?: Array<any>;
  nextCursor?: string | null;
  backwardsCursor?: string | null;
  projects?: ProjectRecord[];
}

export interface ThreadSnapshot {
  hostId: number;
  projectId: number | null;
  threadId: string;
  currentThread: unknown;
  history: unknown;
  events: GatewayEvent[];
  olderTurnsCursor: string | null;
  newerTurnsCursor: string | null;
  lastEventId: number;
}

export interface ThreadPreviewState extends ThreadSnapshot {
  loading: boolean;
  error: string | null;
}

export interface SubAgentPanelState {
  hostId: number;
  threadId: string;
  title: string;
}

export interface ComposerDraft {
  text: string;
  attachedFiles: Array<UploadedFileRecord & { id: string; dataUrl?: string }>;
}

export interface PendingSteerInput {
  text: string;
  clientUserMessageId: string;
  content: any[];
  images: Array<{
    path?: string;
    url?: string;
    detail?: "low" | "high" | "auto" | "original";
  }>;
}

export interface SubmittedTurnRequestState {
  kind: "start" | "steer";
  hostId: number;
  projectId: number | null;
  threadId: string;
  cwd: string | null;
  text: string;
  options: ComposerTurnOptions;
  retryCount: number;
  pendingRetryTurnId: string | null;
  retryTimer: ReturnType<typeof window.setTimeout> | null;
}

export interface GatewayErrorState {
  message: string;
  hostId: number | null;
  projectId: number | null;
  threadId: string | null;
  updatedAt: number;
}

export interface GatewayStoreState {
  hosts: HostRecord[];
  projects: ProjectRecord[];
  threads: Array<any>;
  models: ModelRecord[];
  loadingModels: boolean;
  hostConnectionStatuses: Record<
    number,
    { status: HostConnectionStatus; message?: string | null; updatedAt?: number }
  >;
  gatewayConfig: GatewayConfig;
  openingPinnedThreadKey: string | null;
  runningThreadKeys: string[];
  threadStatuses: Record<string, ThreadRuntimeStatus>;
  activeTurnIdsByThreadKey: Record<string, string>;
  threadSettingsByKey: Record<string, ThreadSettingsState>;
  threadTokenUsageByKey: Record<string, ThreadTokenUsageState>;
  composerDraftsByKey: Record<string, ComposerDraft>;
  submittedTurnRequestsByKey: Record<string, SubmittedTurnRequestState>;
  pendingSteersByKey: Record<string, PendingSteerInput[]>;
  threadSnapshots: Record<string, ThreadSnapshot>;
  threadPreviews: Record<string, ThreadPreviewState>;
  subAgentPanels: SubAgentPanelState[];
  activeSubAgentPanelKey: string | null;
  selectedHostId: number | null;
  selectedProjectId: number | null;
  selectedThreadId: string | null;
  viewEpoch: number;
  currentThread: unknown;
  history: unknown;
  events: GatewayEvent[];
  status: GatewayStatus | null;
  initializing: boolean;
  loading: boolean;
  loadingOlderTurns: boolean;
  olderTurnsCursor: string | null;
  newerTurnsCursor: string | null;
  error: GatewayErrorState | null;
  realtimeSocket: WebSocket | null;
  realtimeSocketConnected: boolean;
  realtimeSocketReconnectTimer: ReturnType<typeof window.setTimeout> | null;
  realtimeSocketReconnectAttempt: number;
  realtimeSocketGeneration: number;
  deliveredNotificationKeys: string[];
  realtimeHostLifecycleSubscribed: boolean;
  realtimeThreadSubscriptions: Record<
    string,
    { hostId: number; threadId: string; afterId: number }
  >;
  lastEventId: number;
  scrollToLatestToken: number;
}

export interface GatewayStoreContext {
  state: GatewayStoreState;
  events: GatewayDomainEvents;
  t: (key: string, values?: Record<string, unknown>) => string;
  errorLabels: ErrorMessageLabels;
  selectedHost: HostRecord | null;
  selectedProject: ProjectRecord | null;
  pinnedThreads: PinnedThreadRecord[];
  runningThreadKeySet: Set<string>;
  selectedThreadStatus: ThreadRuntimeStatus;
  defaultModel: ModelRecord | null;
  selectedThreadSettings: ThreadSettingsState;
  selectedThreadTokenUsage: ThreadTokenUsageState | null;
  selectedComposerDraft: ComposerDraft;
  [action: string]: any;
}

export interface ThreadStatusUpdateOptions {
  notifyTerminal?: boolean;
  turnId?: string | null;
}
