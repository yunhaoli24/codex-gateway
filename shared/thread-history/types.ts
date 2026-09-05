export type ThreadHistoryStatus = string | { type?: unknown } | null | undefined;

export interface ThreadPlanStep extends Record<string, unknown> {
  step: string;
  status?: string | null;
}

export interface ThreadUserInputOption extends Record<string, unknown> {
  label: string;
  description?: string | null;
}

export interface ThreadUserInputQuestion extends Record<string, unknown> {
  id: string;
  header?: string | null;
  question: string;
  options?: ThreadUserInputOption[];
  isOther?: boolean;
  isSecret?: boolean;
}

export interface ThreadAsyncUserInputQuestion extends Record<string, unknown> {
  title: string;
  options: string[] | null;
}

export interface ThreadRequestParams extends Record<string, unknown> {
  reason?: string | null;
  previousAccountId?: string | null;
  namespace?: string | null;
  tool?: string | null;
  arguments?: unknown;
  serverName?: string | null;
  mode?: string | null;
  message?: string | null;
  url?: string | null;
  requestedSchema?: unknown;
  /** Required by Codex 0.147 for requestUserInput; optional here because this is a shared request union. */
  isBlocking?: boolean;
  /** Deprecated by Codex 0.147; retained in the exact upstream request shape until it is removed upstream. */
  autoResolutionMs?: number | null;
  permissions?: ThreadRequestedPermissions;
  cwd?: string | null;
  questions?: ThreadUserInputQuestion[];
}

export interface ThreadRequestedPermissions extends Record<string, unknown> {
  network?: { enabled?: boolean | null } | null;
  fileSystem?: {
    read?: unknown[];
    write?: unknown[];
    entries?: unknown[];
  } | null;
}

export interface ThreadPendingApproval extends Record<string, unknown> {
  requestId?: string | number | null;
  method?: string | null;
  params?: ThreadRequestParams | null;
}

export interface ThreadHistoryItem extends Record<string, unknown> {
  id?: string | number | null;
  clientId?: string | number | null;
  turnId?: string | number | null;
  type?: string | null;
  status?: ThreadHistoryStatus;
  text?: string | null;
  /** `async` is a user-visible message delivered without completing the active turn. */
  delivery?: "async" | null;
  /** Structured choices attached to an async agent message; replies remain ordinary user input. */
  questions?: ThreadAsyncUserInputQuestion[] | null;
  explanation?: string | null;
  content?: unknown[];
  summary?: unknown[];
  fragments?: unknown[];
  plan?: ThreadPlanStep[];
  params?: ThreadRequestParams | null;
  requestId?: string | number | null;
  pendingApproval?: ThreadPendingApproval | null;
  command?: string | null;
  /** Trusted first-party plugin that resolved this command, when present. */
  pluginId?: string | null;
  /** Safe plugin-relative script path paired with pluginId. */
  scriptPath?: string | null;
  aggregatedOutput?: string | null;
  result?: string | { text?: string | null } | null;
  exitCode?: number | null;
  changes?: ThreadFileChange[];
  tool?: string | null;
  /** MCP tool annotation from Codex 0.147; null means the server did not provide one. */
  readOnlyHint?: boolean | null;
  server?: string | null;
  arguments?: unknown;
  error?: { message?: string | null } | null;
  name?: string | null;
  contentItems?: unknown[];
  revisedPrompt?: string | null;
  /** Image generation background mode from Codex 0.147. */
  transparentBackground?: boolean | null;
  savedPath?: string | null;
  review?: string | null;
  query?: string | null;
  action?: unknown;
  results?: unknown;
  prompt?: string | null;
  receiverThreadIds?: Array<string | number>;
  agentsStates?: Record<string, unknown>;
}

export const threadTimelineItemTypes = [
  "agentMessage",
  "appNotification",
  "attestationRequest",
  "chatgptAuthTokensRefreshRequest",
  "commandExecution",
  "contextCompaction",
  "collabAgentToolCall",
  "dynamicToolClientRequest",
  "dynamicToolCall",
  "enteredReviewMode",
  "exitedReviewMode",
  "fileChange",
  "hookPrompt",
  "imageGeneration",
  "imageView",
  "mcpElicitationRequest",
  "mcpToolCall",
  "permissionsRequest",
  "plan",
  "reasoning",
  "requestUserInput",
  "serverRequest",
  "sleep",
  "subAgentActivity",
  "threadGoal",
  "turnPlan",
  "userMessage",
  "webSearch",
] as const;

export type ThreadTimelineItemType = (typeof threadTimelineItemTypes)[number];

/** Item shape after the app-server history boundary has established a renderable type. */
export type ThreadTimelineItem = ThreadHistoryItem & {
  type: ThreadTimelineItemType;
};

export type ThreadTimelineTurn = Omit<ThreadHistoryTurn, "id" | "items"> & {
  id: string;
  items: ThreadTimelineItem[];
};

export interface ThreadResponseUsage {
  responseId: string;
  amount: string;
}

export interface ThreadHistoryTurn {
  id?: string | number | null;
  status?: ThreadHistoryStatus;
  items?: ThreadHistoryItem[];
  itemsView?: "notLoaded" | "summary" | "full";
  error?: {
    message?: string | null;
    codexErrorInfo?: unknown;
    additionalDetails?: string | null;
  } | null;
  startedAt?: number | string | null;
  completedAt?: number | string | null;
  durationMs?: number | null;
  /** Gateway projection of transient `rawResponse/completed` events, keyed by response id. */
  responseUsage?: ThreadResponseUsage[];
  diff?: string | null;
}

/** Minimal thread shape reducers need while constructing a timeline. */
export interface ThreadHistorySeed {
  id: string;
  turns?: ThreadHistoryTurn[];
}

export interface ThreadHistoryThread {
  id: string;
  turns: ThreadHistoryTurn[];
}

export interface ThreadHistoryState {
  thread: ThreadHistoryThread;
}

/** History after the Gateway boundary has removed items without a registered timeline presenter. */
export interface ThreadTimelineHistoryState extends ThreadHistoryState {
  thread: {
    id: string;
    turns: ThreadTimelineTurn[];
  };
}

export interface ThreadFileChange extends Record<string, unknown> {
  path?: string | null;
  filePath?: string | null;
  pathAfter?: string | null;
  pathBefore?: string | null;
  diff?: string | null;
  kind?: string | { type?: string | null; kind?: string | null } | null;
  sequence?: number | null;
}

export interface ThreadServerRequestItem extends ThreadHistoryItem {
  requestId?: string | number | null;
  pendingApproval?: {
    requestId?: string | number | null;
  } | null;
}
