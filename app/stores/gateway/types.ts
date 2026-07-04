import type {
  GatewayConfig,
  GatewayEvent,
  HostRecord,
  ModelRecord,
  PinnedThreadRecord,
  ProjectRecord,
  TerminalOpenTarget,
  TerminalSessionSnapshot,
  ThreadGoal,
  ThreadRuntimeStatus,
  ThreadSettingsState,
  ThreadTokenUsageState,
  UploadedFileRecord,
} from "~~/shared/types";
import type { EventEmitter } from "@posva/event-emitter";
import type { GatewayDomainEventMap } from "./domain-events";
import type { GatewayErrorContext } from "./errors";
import type { ErrorMessageLabels } from "./thread-utils/identity";

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
  data?: Array<any>;
  nextCursor?: string | null;
  backwardsCursor?: string | null;
  projects?: ProjectRecord[];
}

export interface ThreadViewState {
  hostId: number;
  projectId: number | null;
  threadId: string;
  currentThread: unknown;
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

export interface WorkspaceTabState {
  id: string;
  kind: "agent" | "terminal";
  title: string;
  sessionId?: string;
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
  activeTerminalProcessByThreadKey: Record<
    string,
    { turnId: string; itemId: string; processId: string }
  >;
  threadSettingsByKey: Record<string, ThreadSettingsState>;
  threadCollaborationModesByKey: Record<string, "default" | "plan">;
  dismissedPlanPromptIdsByKey: Record<string, Record<string, true>>;
  threadGoalsByKey: Record<string, ThreadGoal>;
  threadGoalObservedAtByKey: Record<string, number>;
  threadTokenUsageByKey: Record<string, ThreadTokenUsageState>;
  composerDraftsByKey: Record<string, ComposerDraft>;
  threadViews: Record<string, ThreadViewState>;
  subAgentPanels: SubAgentPanelState[];
  activeSubAgentPanelKey: string | null;
  selectedHostId: number | null;
  selectedProjectId: number | null;
  selectedThreadId: string | null;
  viewEpoch: number;
  currentThread: unknown;
  history: unknown;
  events: GatewayEvent[];
  initializing: boolean;
  loading: boolean;
  loadingOlderTurns: boolean;
  olderTurnsCursor: string | null;
  newerTurnsCursor: string | null;
  error: GatewayErrorState | null;
  lastEventId: number;
  scrollToLatestToken: number;
}

export interface GatewayStoreContext {
  state: GatewayStoreState;
  events: EventEmitter<GatewayDomainEventMap>;
  t: (key: string, values?: Record<string, unknown>) => string;
  errorLabels: ErrorMessageLabels;
  selectedHost: HostRecord | null;
  selectedProject: ProjectRecord | null;
  pinnedThreads: PinnedThreadRecord[];
  runningThreadKeySet: Set<string>;
  selectedThreadStatus: ThreadRuntimeStatus;
  defaultModel: ModelRecord | null;
  selectedThreadSettings: ThreadSettingsState;
  selectedThreadCollaborationMode: "default" | "plan";
  selectedThreadGoal: ThreadGoal | null;
  selectedThreadGoalObservedAt: number | null;
  selectedThreadTokenUsage: ThreadTokenUsageState | null;
  selectedComposerDraft: ComposerDraft;
  persistConfig: () => void;
  syncConfigToServer: () => Promise<void>;
  applyConfig: (config: GatewayConfig) => void;
  loadConfigFromServer: () => Promise<void>;
  refresh: () => Promise<void>;
  connectAllHosts: () => Promise<void>;
  listModels: () => Promise<void>;
  listThreads: (searchTerm?: string) => Promise<void>;
  decorateThreads: (threads: any[]) => any[];
  ensureSelectedProject: () => void;
  mergeProjects: (projects: ProjectRecord[]) => void;
  beginViewTransition: () => number;
  isCurrentViewTransition: (epoch: number) => boolean;
  cacheSelectedThreadView: () => void;
  restoreThreadView: (hostId: number, threadId: string) => boolean;
  clearCurrentThreadView: () => void;
  rememberOpenThread: (threadId: string) => void;
  requestScrollToLatest: () => void;
  syncSelectedRoute: (options?: { replace?: boolean }) => void;
  openThread: (
    threadId: string,
    context?: { hostId?: number | null; projectId?: number | null; replaceRoute?: boolean },
  ) => Promise<void>;
  openThreadPreview: (
    hostId: number,
    threadId: string,
    context?: { projectId?: number | null; limit?: number },
  ) => Promise<ThreadViewState | undefined>;
  restoreLastOpenThread: () => Promise<boolean>;
  setThreadRunning: (hostId: number, threadId: string, running: boolean) => void;
  setThreadStatus: (
    hostId: number,
    threadId: string,
    status: ThreadRuntimeStatus,
    options?: ThreadStatusUpdateOptions,
  ) => void;
  setThreadTokenUsage: (
    hostId: number,
    threadId: string,
    tokenUsage: ThreadTokenUsageState,
  ) => void;
  setThreadSettings: (
    hostId: number,
    threadId: string,
    settings: ThreadSettingsState | null | undefined,
  ) => void;
  updateSelectedThreadSettings: (settings: ThreadSettingsState) => void;
  setThreadCollaborationMode: (hostId: number, threadId: string, mode: "default" | "plan") => void;
  dismissPlanImplementationPrompt: (hostId: number, threadId: string, planItemId: string) => void;
  upsertThreadGoal: (hostId: number, threadId: string, goal: ThreadGoal) => void;
  clearThreadGoalState: (hostId: number, threadId: string) => void;
  refreshSelectedThreadGoal: () => Promise<void>;
  applyLiveEvent: (event: GatewayEvent) => void;
  upsertPinnedMetadataFromThread: (thread: any) => void;
  setError: (message: string, context?: GatewayErrorContext & { transient?: boolean }) => void;
  clearError: () => void;
}

export interface ThreadStatusUpdateOptions {
  turnId?: string | null;
}

export type TerminalOpenInput = Omit<TerminalOpenTarget, "cols" | "rows"> & {
  cols?: number;
  rows?: number;
};
