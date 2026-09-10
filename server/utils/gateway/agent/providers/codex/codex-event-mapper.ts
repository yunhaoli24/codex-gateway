/**
 * Codex notification → canonical AgentEvent mapper.
 *
 * Absorbs all Codex-specific semantics previously scattered across:
 * - the former raw app-server history reducer chain
 * - shared/thread-runtime-status.ts (RUNTIME_STATUS_EVENT_REDUCERS)
 * - app/stores/gateway/event-handlers/file-change-sequence.ts (duplicate counter)
 *
 * Codex server-request method routing stays in this provider directory and
 * never becomes part of the neutral event contract.
 *
 * This is the single point where raw Codex method+params become
 * Gateway canonical events.  Every downstream consumer — server
 * snapshot projection, browser live projection, WS fan-out,
 * notification dispatcher, subagent store, runtime status hub —
 * receives the same canonical AgentEvent shapes.
 */
import type { AgentEvent } from "~~/shared/agent/events";
import { recordFromUnknown } from "~~/shared/utils/records";
import { PENDING_SERVER_REQUEST_METHODS, itemTypeForServerRequest } from "./codex-server-requests";
import { type AppServerEventParams, idParam, itemParam, turnParam } from "./codex-reducer-helpers";
import { itemLifecycleTimestampMs } from "./codex-timing";
import { tagFileChanges } from "./codex-file-change-sequencer";

function isPendingServerRequestMethod(method: string): boolean {
  return (PENDING_SERVER_REQUEST_METHODS as readonly string[]).includes(method);
}

// ── Main mapper ────────────────────────────────────────────────────

export interface CodexNotification {
  method: string;
  params: unknown;
  /** RPC request id (present for server→client requests). */
  id?: string | number;
  /** App-server emission timestamp (ms). */
  emittedAtMs?: number;
}

export interface MapperResult {
  event: AgentEvent;
  /** App-server time, extracted from the notification. */
  emittedAt?: number;
  /** For server requests: the rpc id used as the request correlation key. */
  requestId?: string | number;
}

/**
 * Map a raw Codex notification into a canonical AgentEvent.
 *
 * Returns null when the notification is intentionally no-oped
 * (no state change to communicate to the Gateway layer).
 */
export function mapCodexNotification(notification: CodexNotification): MapperResult | null {
  const { method, params, id, emittedAtMs } = notification;
  const p = asParams(params);

  // ── Turn lifecycle ────────────────────────────────────────────
  if (method === "turn/started") {
    const turn = validatedTurnRecord(p);
    if (!turn) return null;
    return { event: { type: "turn.started", turn }, emittedAt: emittedAtMs };
  }

  if (method === "turn/completed") {
    const turn = validatedTurnRecord(p);
    if (!turn) return null;
    return { event: { type: "turn.completed", turn }, emittedAt: emittedAtMs };
  }

  if (method === "turn/diff/updated") {
    const turnId = idParam(p.turnId);
    if (turnId === null || typeof p.diff !== "string") return null;
    return {
      event: { type: "turn.diff.updated", turnId: String(turnId), diff: p.diff },
      emittedAt: emittedAtMs,
    };
  }

  if (method === "turn/plan/updated") {
    const turnId = idParam(p.turnId);
    if (turnId === null || !Array.isArray(p.plan)) return null;
    const explanation = typeof p.explanation === "string" ? p.explanation : "";
    return {
      event: {
        type: "turn.plan.updated",
        turnId: String(turnId),
        explanation,
        plan: p.plan,
      },
      emittedAt: emittedAtMs,
    };
  }

  // ── Item lifecycle (started / completed) ──────────────────────
  if (method === "item/started") {
    const item = buildLifecycleItem(p, "started");
    if (!item) return null;
    return { event: { type: "timeline.item.upsert", item }, emittedAt: emittedAtMs };
  }

  if (method === "item/completed") {
    const item = buildLifecycleItem(p, "completed");
    if (!item) return null;
    return { event: { type: "timeline.item.upsert", item }, emittedAt: emittedAtMs };
  }

  // ── Approval items ────────────────────────────────────────────
  if (method === "item/commandExecution/requestApproval") {
    const requestId = typeof id === "string" || typeof id === "number" ? id : undefined;
    if (requestId === undefined || idParam(p.itemId) === null || idParam(p.turnId) === null)
      return null;
    return {
      event: {
        type: "timeline.item.upsert",
        item: {
          type: "commandExecution",
          id: idParam(p.itemId),
          turnId: idParam(p.turnId),
          status: "waitingForApproval",
          command: stringFromUnknown(p.command),
          cwd: stringFromUnknown(p.cwd),
          pendingApproval: { requestId, method, params: p },
        },
      },
      emittedAt: emittedAtMs,
      requestId,
    };
  }

  if (method === "item/fileChange/requestApproval") {
    const requestId = typeof id === "string" || typeof id === "number" ? id : undefined;
    if (requestId === undefined || idParam(p.itemId) === null || idParam(p.turnId) === null)
      return null;
    return {
      event: {
        type: "timeline.item.upsert",
        item: {
          type: "fileChange",
          id: idParam(p.itemId),
          turnId: idParam(p.turnId),
          status: "waitingForApproval",
          pendingApproval: { requestId, method, params: p },
        },
      },
      emittedAt: emittedAtMs,
      requestId,
    };
  }

  if (method === "item/fileChange/patchUpdated") {
    if (idParam(p.itemId) === null || idParam(p.turnId) === null || !Array.isArray(p.changes))
      return null;
    return {
      event: {
        type: "timeline.item.upsert",
        item: {
          type: "fileChange",
          id: idParam(p.itemId),
          turnId: idParam(p.turnId),
          changes: tagFileChanges(p.changes),
          status: "inProgress",
        },
      },
      emittedAt: emittedAtMs,
    };
  }

  // ── Pending server requests (7 methods) ───────────────────────
  if (isPendingServerRequestMethod(method)) {
    if (method === "currentTime/read") return null;
    const requestId = typeof id === "string" || typeof id === "number" ? id : undefined;
    if (requestId === undefined) return null;
    const stableItemId = idParam(p.itemId) ?? requestId;
    const item: Record<string, unknown> = {
      type: itemTypeForServerRequest(method),
      id: `server-request-${String(stableItemId)}`,
      turnId: idParam(p.turnId) ?? `server-request-turn-${String(stableItemId)}`,
      status: "waitingForClient",
      requestId,
      method,
      params: p,
    };
    const requestKind = requestKindForMethod(method);
    if (requestKind === null) return null;
    return {
      event: {
        type: "serverRequest.requested",
        requestId,
        item,
        requestKind,
      },
      emittedAt: emittedAtMs,
      requestId,
    };
  }

  // ── Server request resolved ───────────────────────────────────
  if (method === "serverRequest/resolved") {
    const requestId = idParam(p.requestId);
    if (requestId === null) return null;
    return {
      event: { type: "serverRequest.resolved", requestId },
      emittedAt: emittedAtMs,
    };
  }

  // ── Stream deltas ─────────────────────────────────────────────
  if (method === "item/agentMessage/delta") {
    if (!stringFromUnknown(p.itemId) || !stringFromUnknown(p.turnId)) return null;
    return {
      event: {
        type: "timeline.item.delta",
        channel: "agentMessage",
        itemId: stringFromUnknown(p.itemId),
        turnId: stringFromUnknown(p.turnId),
        delta: stringFromUnknown(p.delta),
      },
      emittedAt: emittedAtMs,
    };
  }

  if (method === "item/plan/delta") {
    if (!stringFromUnknown(p.itemId) || !stringFromUnknown(p.turnId)) return null;
    return {
      event: {
        type: "timeline.item.delta",
        channel: "plan",
        itemId: stringFromUnknown(p.itemId),
        turnId: stringFromUnknown(p.turnId),
        delta: stringFromUnknown(p.delta),
      },
      emittedAt: emittedAtMs,
    };
  }

  if (method === "item/reasoning/summaryTextDelta") {
    if (!stringFromUnknown(p.itemId) || !stringFromUnknown(p.turnId)) return null;
    return {
      event: {
        type: "timeline.item.delta",
        channel: "reasoningSummary",
        itemId: stringFromUnknown(p.itemId),
        turnId: stringFromUnknown(p.turnId),
        delta: stringFromUnknown(p.delta),
        summaryIndex: numericParam(p.summaryIndex),
      },
      emittedAt: emittedAtMs,
    };
  }

  if (method === "item/reasoning/textDelta") {
    if (!stringFromUnknown(p.itemId) || !stringFromUnknown(p.turnId)) return null;
    return {
      event: {
        type: "timeline.item.delta",
        channel: "reasoningText",
        itemId: stringFromUnknown(p.itemId),
        turnId: stringFromUnknown(p.turnId),
        delta: stringFromUnknown(p.delta),
        contentIndex: numericParam(p.contentIndex),
      },
      emittedAt: emittedAtMs,
    };
  }

  if (method === "item/commandExecution/outputDelta") {
    if (!stringFromUnknown(p.itemId) || !stringFromUnknown(p.turnId)) return null;
    return {
      event: {
        type: "timeline.item.delta",
        channel: "commandOutput",
        itemId: stringFromUnknown(p.itemId),
        turnId: stringFromUnknown(p.turnId),
        delta: stringFromUnknown(p.delta),
      },
      emittedAt: emittedAtMs,
    };
  }

  // ── Thread state events ───────────────────────────────────────
  if (method === "thread/status/changed") {
    return { event: { type: "thread.status.changed", status: p.status }, emittedAt: emittedAtMs };
  }

  if (method === "thread/settings/updated") {
    return {
      event: { type: "thread.settings.updated", threadSettings: p.threadSettings },
      emittedAt: emittedAtMs,
    };
  }

  if (method === "thread/tokenUsage/updated") {
    return {
      event: { type: "thread.usage.updated", tokenUsage: p.tokenUsage },
      emittedAt: emittedAtMs,
    };
  }

  if (method === "thread/started") {
    const thread = recordFromUnknown(p.thread);
    if (thread === null) return null;
    return {
      event: { type: "thread.started", thread },
      emittedAt: emittedAtMs,
    };
  }

  // ── Goals ─────────────────────────────────────────────────────
  if (method === "thread/goal/updated") {
    return { event: { type: "thread.goal.updated", goal: p.goal }, emittedAt: emittedAtMs };
  }

  if (method === "thread/goal/cleared") {
    return { event: { type: "thread.goal.cleared" }, emittedAt: emittedAtMs };
  }

  // ── Response usage ────────────────────────────────────────────
  if (method === "rawResponse/completed") {
    const completed = rawResponseCompletedFromUnknown(p);
    if (
      !completed ||
      completed.usageMetadata?.amount === null ||
      completed.usageMetadata?.amount === undefined
    ) {
      return null;
    }
    return {
      event: {
        type: "turn.usage.upsert",
        turnId: completed.turnId,
        responseId: completed.responseId,
        amount: completed.usageMetadata.amount,
      },
      emittedAt: emittedAtMs,
    };
  }

  // ── Errors ────────────────────────────────────────────────────
  if (method === "error") {
    return { event: { type: "error.reported", params: p }, emittedAt: emittedAtMs };
  }

  if (method === "thread/realtime/error") {
    const message = stringFromUnknown(p.message);
    if (!message) return null;
    return {
      event: { type: "thread.realtime.error", message },
      emittedAt: emittedAtMs,
    };
  }

  // ── MCP ───────────────────────────────────────────────────────
  if (method === "mcpServer/event/stream/notification") {
    return {
      event: {
        type: "mcp.eventStream.notification",
        subscriptionId: stringFromUnknown(p.subscriptionId),
        notification: p.notification,
      },
      emittedAt: emittedAtMs,
    };
  }

  if (method === "mcpServer/startupStatus/updated") {
    return { event: { type: "mcpServer.startupStatus.updated" }, emittedAt: emittedAtMs };
  }

  // Unknown methods are deliberately dropped. An explicit allowlist below is
  // the provider boundary; otherwise a new upstream method could leak opaque
  // protocol data into the neutral event stream and become accidental API.
  if (!isAmbientCodexNotification(method)) return null;
  return { event: { type: "notice", source: method, params: p }, emittedAt: emittedAtMs };
}

const ambientCodexNotifications = new Set([
  "thread/archived",
  "thread/deleted",
  "thread/unarchived",
  "thread/closed",
  "thread/name/updated",
  "skills/changed",
  "hook/started",
  "hook/completed",
  "warning",
  "guardianWarning",
  "deprecationNotice",
  "configWarning",
  "account/updated",
  "account/rateLimits/updated",
  "app/list/updated",
  "remoteControl/status/changed",
  "fs/changed",
  "thread/compacted",
  "model/rerouted",
  "model/verification",
  "modelProvider/authRecoveryStarted",
  "modelProvider/authRecoveryCompleted",
  "turn/moderationMetadata",
  "model/safetyBuffering/updated",
  "item/commandExecution/terminalInteraction",
  "item/mcpToolCall/progress",
  "mcpServer/oauthLogin/completed",
  "mcpServer/startupStatus/updated",
  "rawResponseItem/completed",
  "thread/realtime/started",
  "thread/realtime/closed",
  "fuzzyFileSearch/sessionUpdated",
  "fuzzyFileSearch/sessionCompleted",
  "windows/worldWritableWarning",
  "windowsSandbox/setupCompleted",
  "account/login/completed",
  "externalAgentConfig/import/progress",
  "externalAgentConfig/import/completed",
]);

function isAmbientCodexNotification(method: string) {
  return ambientCodexNotifications.has(method);
}

function requestKindForMethod(method: string) {
  if (method === "item/tool/requestUserInput") return "userInput" as const;
  if (method === "mcpServer/elicitation/request") return "elicitation" as const;
  if (
    method === "item/permissions/requestApproval" ||
    method === "item/commandExecution/requestApproval" ||
    method === "item/fileChange/requestApproval"
  )
    return "approval" as const;
  if (method === "item/tool/call") return "dynamicTool" as const;
  if (method === "account/chatgptAuthTokens/refresh") return "authRefresh" as const;
  if (method === "attestation/generate") return "attestation" as const;
  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Validate a turn param structurally (id present) and widen it to the record
 * shape carried by canonical turn events, without type assertions.
 */
function validatedTurnRecord(params: AppServerEventParams): Record<string, unknown> | null {
  const turn = turnParam(params);
  return turn === null ? null : recordFromUnknown(turn);
}

function asParams(value: unknown): AppServerEventParams {
  return recordFromUnknown(value) ?? {};
}

function stringFromUnknown(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numericParam(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function buildLifecycleItem(
  params: AppServerEventParams,
  phase: "started" | "completed",
): Record<string, unknown> | null {
  const item = itemParam(params);
  if (!item) return null;
  const lifecycleTimestamp = itemLifecycleTimestampMs(params, phase);
  return {
    ...item,
    turnId: idParam(params.turnId),
    status: item.status ?? (phase === "started" ? "inProgress" : "completed"),
    ...(phase === "started" ? { startedAt: lifecycleTimestamp } : {}),
    ...(phase === "completed" ? { completedAt: lifecycleTimestamp } : {}),
  };
}

// ── rawResponse/completed parser (absorbed from shared/.../raw-response.ts) ─

interface RawResponseCompleted {
  turnId: string;
  responseId: string;
  usageMetadata: { amount: string } | null;
}

function rawResponseCompletedFromUnknown(value: unknown): RawResponseCompleted | null {
  const r = recordFromUnknown(value);
  if (!r) return null;
  const usage = recordFromUnknown(r.usageMetadata);
  const turnId = stringFromUnknown(r.turnId);
  const responseId = stringFromUnknown(r.responseId);
  if (!turnId || !responseId) return null;
  return {
    turnId,
    responseId,
    usageMetadata: usage ? { amount: stringFromUnknown(usage.amount) } : null,
  };
}
