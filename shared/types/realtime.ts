import type { GatewayEvent } from "./records";
import type {
  ComposerTurnOptions,
  ThreadGoal,
  ThreadGoalStatus,
  ThreadItemsPageResult,
  ThreadOpenResult,
  ThreadRuntimeStatusUpdate,
  ThreadTurnsPageResult,
} from "./thread";
import type { ApprovalPolicy, ReasoningEffort } from "./thread";
import type { TerminalOpenTarget, TerminalSessionSnapshot } from "./terminal";
import type {
  BrowserPreviewResourceFailure,
  BrowserPreviewSessionSnapshot,
  BrowserPreviewTarget,
} from "./browser";
import type { ServerNotification } from "./notifications";
import type {
  HostGpuProcessSnapshot,
  HostMetricsCollectorStatus,
  HostMetricsSample,
} from "./host-metrics";
import type { TmuxSessionsSnapshot } from "./tmux";
import type { RemoteGitFileComparison, RemoteGitWorkspaceSnapshot } from "./files";
import type { ProjectFileSearchResult } from "./files";
import type { GatewayMcpServerStatus } from "./mcp";
import type { AgentProviderId } from "../agent/providers";

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
      type: "host.metrics.subscribe";
      requestId: string;
      hostId: number;
    }
  | {
      type: "host.metrics.unsubscribe";
      hostId: number;
    }
  | {
      type: "tmux.sessions.subscribe";
      requestId: string;
      hostId: number;
    }
  | {
      type: "tmux.sessions.refresh";
      requestId: string;
      hostId: number;
    }
  | {
      type: "tmux.sessions.unsubscribe";
      hostId: number;
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
      afterEpoch?: string;
    }
  | {
      type: "thread.unsubscribe";
      hostId: number;
      threadId: string;
    }
  | {
      type: "thread.turns.load";
      requestId: string;
      hostId: number;
      threadId: string;
      cursor?: string | null;
      limit?: number;
      sortDirection?: "asc" | "desc";
    }
  | {
      type: "thread.items.load";
      requestId: string;
      hostId: number;
      threadId: string;
      turnId: string;
      cursor?: string | null;
      limit?: number;
      sortDirection?: "asc" | "desc";
    }
  | {
      type: "thread.start";
      requestId: string;
      hostId: number;
      projectId?: number | null;
      cwd?: string | null;
      provider?: AgentProviderId;
      model?: string | null;
      effort?: ReasoningEffort | null;
      approvalPolicy?: ApprovalPolicy | null;
    }
  | {
      type: "turn.start";
      requestId: string;
      hostId: number;
      threadId: string;
      projectId: number;
      text: string;
      clientUserMessageId?: string | null;
      cwd?: string | null;
      model?: string | null;
      effort?: ReasoningEffort | null;
      approvalPolicy?: ApprovalPolicy | null;
      collaborationMode?: ComposerTurnOptions["collaborationMode"];
      images?: ComposerTurnOptions["images"];
      files?: ComposerTurnOptions["files"];
      references?: ComposerTurnOptions["references"];
    }
  | {
      type: "turn.steer";
      requestId: string;
      hostId: number;
      threadId: string;
      projectId: number;
      expectedTurnId: string;
      text: string;
      clientUserMessageId?: string | null;
      images?: ComposerTurnOptions["images"];
      references?: ComposerTurnOptions["references"];
    }
  | {
      type: "turn.interrupt";
      requestId: string;
      hostId: number;
      threadId: string;
      turnId: string;
    }
  | {
      type: "turn.settings.update";
      requestId: string;
      hostId: number;
      threadId: string;
      turnId: string;
      model?: string | null;
      effort?: ReasoningEffort | null;
    }
  | {
      type: "mcp.status.list";
      requestId: string;
      hostId: number;
      threadId: string;
    }
  | {
      type: "mcp.event.stream.start";
      requestId: string;
      hostId: number;
      threadId: string;
      server: string;
      subscriptionId: string;
      name: string;
      arguments: unknown;
      meta?: unknown;
    }
  | {
      type: "mcp.event.stream.stop";
      requestId: string;
      hostId: number;
      threadId: string;
      subscriptionId: string;
    }
  | {
      type: "thread.goal.set";
      requestId: string;
      hostId: number;
      threadId: string;
      objective?: string | null;
      status?: ThreadGoalStatus | null;
      tokenBudget?: number | null;
    }
  | {
      type: "thread.goal.clear";
      requestId: string;
      hostId: number;
      threadId: string;
    }
  | {
      type: "thread.goal.get";
      requestId: string;
      hostId: number;
      threadId: string;
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
  | ({ type: "browser.open"; requestId: string } & BrowserPreviewTarget)
  | { type: "browser.close"; requestId: string; sessionId: string }
  | {
      type: "browser.allowInsecureTls";
      requestId: string;
      sessionId: string;
      allowInsecureTls: boolean;
    }
  | {
      type: "file.search";
      requestId: string;
      hostId: number;
      projectId: number;
      query: string;
      cancellationToken: string;
    }
  | {
      type: "file.watch.subscribe";
      requestId: string;
      hostId: number;
      projectId: number;
      threadId: string;
      paths: string[];
    }
  | {
      type: "file.watch.unsubscribe";
      hostId: number;
      projectId: number;
      threadId: string;
      subscriptionId: string;
    }
  | {
      type: "file.git.compare";
      requestId: string;
      hostId: number;
      projectId: number;
      path: string;
    }
  | {
      type: "file.git.workspace.inspect";
      requestId: string;
      hostId: number;
      projectId: number;
      rootPath: string;
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
      type: "notification.published";
      notification: ServerNotification;
    }
  | {
      type: "config.pinnedThreads.changed";
    }
  | {
      type: "thread.runtime.snapshot";
      statuses: ThreadRuntimeStatusUpdate[];
    }
  | {
      type: "thread.runtime.updated";
      update: ThreadRuntimeStatusUpdate;
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
      type: "host.metrics.snapshot";
      requestId: string;
      hostId: number;
      status: HostMetricsCollectorStatus;
      message: string | null;
      samples: HostMetricsSample[];
      gpuProcesses: HostGpuProcessSnapshot | null;
    }
  | {
      type: "host.metrics.sample";
      hostId: number;
      sample: HostMetricsSample;
      gpuProcesses: HostGpuProcessSnapshot | null;
    }
  | {
      type: "host.metrics.status";
      hostId: number;
      status: HostMetricsCollectorStatus;
      message: string | null;
    }
  | ({ type: "tmux.sessions.snapshot"; requestId: string } & TmuxSessionsSnapshot)
  | ({ type: "tmux.sessions.updated" } & TmuxSessionsSnapshot)
  | {
      type: "thread.event";
      event: GatewayEvent;
    }
  | {
      type: "thread.events.gap";
      hostId: number;
      threadId: string;
      afterId: number;
      lastEventId: number;
      eventEpoch: string;
    }
  | ({
      type: "thread.snapshot";
      requestId: string;
      hostId: number;
      threadId: string;
      lastEventId: number;
      eventEpoch: string;
    } & ThreadOpenResult)
  | ({
      type: "thread.started";
      requestId: string;
      hostId: number;
      threadId: string;
      lastEventId: number;
      eventEpoch: string;
    } & ThreadOpenResult)
  | ({
      type: "thread.turns.page";
      requestId: string;
      hostId: number;
      threadId: string;
    } & ThreadTurnsPageResult)
  | ({
      type: "thread.items.page";
      requestId: string;
      hostId: number;
      threadId: string;
    } & ThreadItemsPageResult)
  | {
      type: "turn.start.accepted";
      requestId: string;
      hostId: number;
      threadId: string;
      turn?: unknown;
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
      type: "turn.settings.updated";
      requestId: string;
      hostId: number;
      threadId: string;
      turnId: string;
      status: "applied" | "targetUnavailable";
    }
  | {
      type: "mcp.status.snapshot";
      requestId: string;
      hostId: number;
      threadId: string;
      servers: GatewayMcpServerStatus[];
    }
  | {
      type: "mcp.event.stream.accepted";
      requestId: string;
      hostId: number;
      threadId: string;
      subscriptionId: string;
      action: "started" | "stopped";
    }
  | {
      type: "thread.goal.updated";
      requestId: string;
      hostId: number;
      threadId: string;
      goal: ThreadGoal;
    }
  | {
      type: "thread.goal.cleared";
      requestId: string;
      hostId: number;
      threadId: string;
      cleared: boolean;
    }
  | {
      type: "thread.goal.snapshot";
      requestId: string;
      hostId: number;
      threadId: string;
      goal: ThreadGoal | null;
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
  | { type: "browser.opened"; requestId: string; session: BrowserPreviewSessionSnapshot }
  | {
      type: "file.search.results";
      requestId: string;
      hostId: number;
      projectId: number;
      result: ProjectFileSearchResult;
    }
  | {
      type: "file.watch.ready";
      requestId: string;
      hostId: number;
      projectId: number;
      threadId: string;
      rootPath: string;
      paths: string[];
    }
  | {
      type: "file.watch.changed";
      hostId: number;
      projectId: number;
      threadId: string;
      rootPath: string;
      paths: string[];
    }
  | {
      type: "file.watch.closed";
      hostId: number;
      projectId: number;
      threadId: string;
    }
  | {
      type: "file.git.comparison";
      requestId: string;
      hostId: number;
      projectId: number;
      path: string;
      comparison: RemoteGitFileComparison;
    }
  | {
      type: "file.git.workspace.snapshot";
      requestId: string;
      hostId: number;
      projectId: number;
      rootPath: string;
      snapshot: RemoteGitWorkspaceSnapshot;
    }
  | { type: "browser.closed"; requestId: string; sessionId: string }
  | { type: "browser.error"; requestId?: string; sessionId?: string; message: string }
  | {
      type: "browser.framePolicyWarning";
      sessionId: string;
      policy: "x-frame-options" | "content-security-policy";
      value: string;
    }
  | {
      type: "browser.resourceFailed";
      sessionId: string;
      failure: BrowserPreviewResourceFailure;
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
