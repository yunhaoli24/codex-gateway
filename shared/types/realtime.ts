import type { GatewayEvent } from "./records";
import type {
  ComposerTurnOptions,
  ThreadGoal,
  ThreadGoalStatus,
  ThreadOpenResult,
  ThreadTurnsPageResult,
} from "./thread";
import type { ApprovalPolicy, ReasoningEffort } from "./thread";
import type { TerminalOpenTarget, TerminalSessionSnapshot } from "./terminal";
import type { BrowserPreviewSessionSnapshot, BrowserPreviewTarget } from "./browser";

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
      type: "thread.turns.load";
      requestId: string;
      hostId: number;
      threadId: string;
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
      model?: string | null;
      effort?: ReasoningEffort | null;
      approvalPolicy?: ApprovalPolicy | null;
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
      images?: ComposerTurnOptions["images"];
    }
  | {
      type: "turn.interrupt";
      requestId: string;
      hostId: number;
      threadId: string;
      turnId: string;
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
      notification: {
        key: string;
        title: string;
        body: string;
        group?: string | null;
        target: {
          hostId: number;
          projectId: number | null;
          threadId: string;
        };
      };
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
  | ({
      type: "thread.started";
      requestId: string;
      hostId: number;
      threadId: string;
      lastEventId: number;
    } & ThreadOpenResult)
  | ({
      type: "thread.turns.page";
      requestId: string;
      hostId: number;
      threadId: string;
    } & ThreadTurnsPageResult)
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
  | { type: "browser.closed"; requestId: string; sessionId: string }
  | { type: "browser.error"; requestId?: string; sessionId?: string; message: string }
  | {
      type: "browser.framePolicyWarning";
      sessionId: string;
      policy: "x-frame-options" | "content-security-policy";
      value: string;
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
