import { z } from "zod";

// ── Canonical Agent Event Types ─────────────────────────────────────────
// Phase 1 canonical event model for the Gateway Agent Protocol.
//
// These events replace the raw Codex method + RpcEnvelope payload on the
// WebSocket wire (`thread.event`). A Provider Adapter (e.g. Codex) maps
// provider-native notifications into this canonical set; the neutral
// Gateway runtime and browser ingestion consume only these types.
//
// Naming follows the existing gateway dot.case convention.
// Events are designed as a full event-sourcing stream — every
// state-affecting notification maps to a canonical event so replay
// (epoch/lastEventId/gap) semantics are preserved.
// ────────────────────────────────────────────────────────────────────────

/**
 * Canonical event type union.
 *
 * Producers:
 * 1. Codex provider mapper  — turn lifecycle, timeline items, deltas,
 *    server requests, usage, errors, notices, goals, MCP events
 * 2. Gateway neutral layer    — gateway.error, gateway.stderr,
 *    synthetic thread/status/changed on thread-open
 */
export type AgentEvent =
  // ── Turn lifecycle ──────────────────────────────────────────────
  | { type: "turn.started"; turn: Record<string, unknown> }
  | { type: "turn.completed"; turn: Record<string, unknown> }
  | { type: "turn.diff.updated"; turnId: string; diff: string }
  | {
      type: "turn.plan.updated";
      turnId: string;
      explanation: string;
      plan: unknown[];
    }

  // ── Timeline items (pre-built fragments from provider mapper) ────
  | { type: "timeline.item.upsert"; item: Record<string, unknown> }

  // ── Stream deltas ───────────────────────────────────────────────
  | {
      type: "timeline.item.delta";
      channel: "agentMessage" | "plan" | "reasoningText" | "reasoningSummary" | "commandOutput";
      itemId: string;
      turnId: string;
      delta: string;
      summaryIndex?: number;
      contentIndex?: number;
    }

  // ── Thread state ────────────────────────────────────────────────
  | { type: "thread.status.changed"; status: unknown }
  | { type: "thread.settings.updated"; threadSettings: unknown }
  | { type: "thread.usage.updated"; tokenUsage: unknown }
  | { type: "thread.started"; thread: Record<string, unknown> }

  // ── Goals ───────────────────────────────────────────────────────
  | { type: "thread.goal.updated"; goal: unknown }
  | { type: "thread.goal.cleared" }

  // ── Server requests ─────────────────────────────────────────────
  | {
      type: "serverRequest.requested";
      requestId: string | number;
      item: Record<string, unknown>;
      requestKind:
        | "userInput"
        | "elicitation"
        | "approval"
        | "dynamicTool"
        | "authRefresh"
        | "attestation";
    }
  | { type: "serverRequest.resolved"; requestId: string | number }

  // ── Response usage ──────────────────────────────────────────────
  | {
      type: "turn.usage.upsert";
      turnId: string;
      responseId: string;
      amount: string;
    }

  // ── Errors ──────────────────────────────────────────────────────
  | { type: "error.reported"; params: Record<string, unknown> }
  | { type: "thread.realtime.error"; message: string }

  // ── Passthrough notice (41 ambient provider notification methods) ─
  | {
      type: "notice";
      /** Original provider method string (e.g. "skills/changed"). */
      source: string;
      params: Record<string, unknown>;
    }

  // ── MCP ─────────────────────────────────────────────────────────
  | {
      type: "mcp.eventStream.notification";
      subscriptionId: string;
      notification: unknown;
    }
  | { type: "mcpServer.startupStatus.updated" }

  // ── Gateway self-produced (neutral layer, not from provider) ─────
  | {
      type: "gateway.error";
      message: string;
      /** Optional thread scope. Omitted for host-level errors. */
      threadId?: string;
    }
  | { type: "gateway.stderr"; text: string };

// ── Zod Schemas (wire validation) ────────────────────────────────────────
// Used by server-message-schema.ts to validate incoming thread.event
// payloads over the WebSocket. Loose parsing for forward compatibility
// with future Phase 2 fields.

const turnStartedSchema = z.object({
  type: z.literal("turn.started"),
  turn: z.record(z.string(), z.unknown()),
});

const turnCompletedSchema = z.object({
  type: z.literal("turn.completed"),
  turn: z.record(z.string(), z.unknown()),
});

const turnDiffUpdatedSchema = z.object({
  type: z.literal("turn.diff.updated"),
  turnId: z.string(),
  diff: z.string(),
});

const turnPlanUpdatedSchema = z.object({
  type: z.literal("turn.plan.updated"),
  turnId: z.string(),
  explanation: z.string(),
  plan: z.array(z.unknown()),
});

const timelineItemUpsertSchema = z.object({
  type: z.literal("timeline.item.upsert"),
  item: z.record(z.string(), z.unknown()),
});

const timelineItemDeltaSchema = z.object({
  type: z.literal("timeline.item.delta"),
  channel: z.enum(["agentMessage", "plan", "reasoningText", "reasoningSummary", "commandOutput"]),
  itemId: z.string(),
  turnId: z.string(),
  delta: z.string(),
  summaryIndex: z.number().optional(),
  contentIndex: z.number().optional(),
});

const threadStatusChangedSchema = z.object({
  type: z.literal("thread.status.changed"),
  status: z.unknown(),
});

const threadSettingsUpdatedSchema = z.object({
  type: z.literal("thread.settings.updated"),
  threadSettings: z.unknown(),
});

const threadUsageUpdatedSchema = z.object({
  type: z.literal("thread.usage.updated"),
  tokenUsage: z.unknown(),
});

const threadStartedSchema = z.object({
  type: z.literal("thread.started"),
  thread: z.record(z.string(), z.unknown()),
});

const threadGoalUpdatedSchema = z.object({
  type: z.literal("thread.goal.updated"),
  goal: z.unknown(),
});

const threadGoalClearedSchema = z.object({
  type: z.literal("thread.goal.cleared"),
});

const serverRequestRequestedSchema = z.object({
  type: z.literal("serverRequest.requested"),
  requestId: z.union([z.string(), z.number()]),
  item: z.record(z.string(), z.unknown()),
  requestKind: z.enum([
    "userInput",
    "elicitation",
    "approval",
    "dynamicTool",
    "authRefresh",
    "attestation",
  ]),
});

const serverRequestResolvedSchema = z.object({
  type: z.literal("serverRequest.resolved"),
  requestId: z.union([z.string(), z.number()]),
});

const turnUsageUpsertSchema = z.object({
  type: z.literal("turn.usage.upsert"),
  turnId: z.string(),
  responseId: z.string(),
  amount: z.string(),
});

const errorReportedSchema = z.object({
  type: z.literal("error.reported"),
  params: z.record(z.string(), z.unknown()),
});

const threadRealtimeErrorSchema = z.object({
  type: z.literal("thread.realtime.error"),
  message: z.string(),
});

const noticeSchema = z.object({
  type: z.literal("notice"),
  source: z.string(),
  params: z.record(z.string(), z.unknown()),
});

const mcpEventStreamNotificationSchema = z.object({
  type: z.literal("mcp.eventStream.notification"),
  subscriptionId: z.string(),
  notification: z.unknown(),
});

const mcpServerStartupStatusUpdatedSchema = z.object({
  type: z.literal("mcpServer.startupStatus.updated"),
});

const gatewayErrorSchema = z.object({
  type: z.literal("gateway.error"),
  message: z.string(),
  threadId: z.string().optional(),
});

const gatewayStderrSchema = z.object({
  type: z.literal("gateway.stderr"),
  text: z.string(),
});

/**
 * Zod schema for validating canonical AgentEvent over the wire.
 * Discriminated union on `type` field.
 */
export const agentEventSchema = z.discriminatedUnion("type", [
  turnStartedSchema,
  turnCompletedSchema,
  turnDiffUpdatedSchema,
  turnPlanUpdatedSchema,
  timelineItemUpsertSchema,
  timelineItemDeltaSchema,
  threadStatusChangedSchema,
  threadSettingsUpdatedSchema,
  threadUsageUpdatedSchema,
  threadStartedSchema,
  threadGoalUpdatedSchema,
  threadGoalClearedSchema,
  serverRequestRequestedSchema,
  serverRequestResolvedSchema,
  turnUsageUpsertSchema,
  errorReportedSchema,
  threadRealtimeErrorSchema,
  noticeSchema,
  mcpEventStreamNotificationSchema,
  mcpServerStartupStatusUpdatedSchema,
  gatewayErrorSchema,
  gatewayStderrSchema,
]);
