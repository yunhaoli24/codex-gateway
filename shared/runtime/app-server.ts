import { z } from "zod";
import type {
  AppServerThread,
  ApprovalPolicy,
  RpcEnvelope,
  ThreadCollaborationMode,
  ThreadGoal,
  ThreadHistoryItem,
  ThreadHistoryTurn,
  ThreadSettingsState,
} from "../types";

const rpcIdSchema = z.union([z.string(), z.number()]);
const rpcErrorSchema = z
  .object({
    code: z.number(),
    message: z.string(),
    data: z.unknown().optional(),
  })
  .strict();
const rpcTraceSchema = z
  .object({
    traceparent: z.string().nullable().optional(),
    tracestate: z.string().nullable().optional(),
  })
  .strict()
  .nullable()
  .optional();

// Codex app-server uses four JSONL envelope shapes: request, notification, success response and
// error response. Keeping their discriminants required rejects `{}` and unrelated objects at the
// transport boundary instead of silently routing them as notifications.
export const rpcEnvelopeSchema = z.union([
  z
    .object({
      id: rpcIdSchema,
      method: z.string().min(1),
      params: z.unknown().optional(),
      trace: rpcTraceSchema,
    })
    .strict(),
  z
    .object({
      method: z.string().min(1),
      params: z.unknown().optional(),
      emittedAtMs: z.number().optional(),
    })
    .strict(),
  z.object({ id: rpcIdSchema, result: z.unknown() }).strict(),
  z.object({ id: rpcIdSchema, error: rpcErrorSchema }).strict(),
]);

export function parseRpcEnvelope(value: unknown): RpcEnvelope {
  return rpcEnvelopeSchema.parse(value);
}

const appServerCollaborationModeSchema = z
  .object({
    mode: z.enum(["default", "plan"]),
    settings: z
      .object({
        model: z.string().min(1),
        reasoning_effort: z.string().nullable().optional(),
        developer_instructions: z.string().nullable().optional(),
      })
      .strict(),
  })
  .strict();

const appServerThreadSettingsSchema = z
  .object({
    model: z.string().min(1),
    effort: z.string().nullable().optional(),
    approvalPolicy: z.unknown(),
    collaborationMode: appServerCollaborationModeSchema,
  })
  .loose();

export function threadCollaborationModeFromAppServer(
  value: unknown,
): ThreadCollaborationMode | null {
  const parsed = appServerCollaborationModeSchema.safeParse(value);
  if (!parsed.success) return null;
  return {
    mode: parsed.data.mode,
    settings: {
      model: parsed.data.settings.model,
      reasoningEffort: parsed.data.settings.reasoning_effort ?? null,
      developerInstructions: parsed.data.settings.developer_instructions ?? null,
    },
  };
}

export function threadSettingsFromAppServer(value: unknown): ThreadSettingsState | null {
  const parsed = appServerThreadSettingsSchema.safeParse(value);
  if (!parsed.success) return null;
  return {
    model: parsed.data.model,
    effort: parsed.data.effort ?? null,
    approvalPolicy: approvalPolicyFromAppServer(parsed.data.approvalPolicy),
    collaborationMode: threadCollaborationModeFromAppServer(parsed.data.collaborationMode),
  };
}

function approvalPolicyFromAppServer(value: unknown): ApprovalPolicy | null {
  return value === "untrusted" || value === "on-request" || value === "never" ? value : null;
}

const threadItemSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
  })
  .loose();

const codexErrorInfoSchema = z.union([
  z.enum([
    "contextWindowExceeded",
    "sessionBudgetExceeded",
    "usageLimitExceeded",
    "rateLimitExceeded",
    "serverOverloaded",
    "cyberPolicy",
    "misalignmentPolicyViolation",
    "internalServerError",
    "unauthorized",
    "badRequest",
    "threadRollbackFailed",
    "sandboxError",
    "other",
  ]),
  z.object({ httpConnectionFailed: z.object({ httpStatusCode: z.number().nullable() }).strict() }),
  z.object({
    responseStreamConnectionFailed: z.object({ httpStatusCode: z.number().nullable() }).strict(),
  }),
  z.object({
    responseStreamDisconnected: z.object({ httpStatusCode: z.number().nullable() }).strict(),
  }),
  z.object({
    responseTooManyFailedAttempts: z.object({ httpStatusCode: z.number().nullable() }).strict(),
  }),
  z.object({
    activeTurnNotSteerable: z.object({ turnKind: z.enum(["review", "compact"]) }).strict(),
  }),
]);

export const threadTurnSchema = z
  .object({
    id: z.string().min(1),
    items: z.array(threadItemSchema),
    itemsView: z.enum(["notLoaded", "summary", "full"]),
    status: z.enum(["completed", "interrupted", "failed", "inProgress"]),
    error: z
      .object({
        message: z.string(),
        codexErrorInfo: codexErrorInfoSchema.nullable(),
        additionalDetails: z.string().nullable(),
        misalignment: z
          .object({
            errorType: z.string().nullable(),
            detailedExplanation: z.string().nullable(),
            steer: z.object({ message: z.string() }).strict().nullable(),
          })
          .strict()
          .nullable(),
      })
      .loose()
      .nullable(),
    startedAt: z.number().nullable(),
    completedAt: z.number().nullable(),
    durationMs: z.number().nullable(),
  })
  .strict();

export const turnsPageSchema = z
  .object({
    data: z.array(threadTurnSchema),
    nextCursor: z.string().nullable(),
    backwardsCursor: z.string().nullable(),
  })
  .loose();

export function parseTurnsPage(value: unknown) {
  return turnsPageSchema.parse(value);
}

export const threadItemsPageSchema = z
  .object({
    data: z.array(
      z
        .object({
          turnId: z.string().min(1),
          item: threadItemSchema,
        })
        .strict(),
    ),
    nextCursor: z.string().nullable(),
    backwardsCursor: z.string().nullable(),
  })
  .loose();

export function parseThreadItemsPage(value: unknown) {
  return threadItemsPageSchema.parse(value);
}

export const appServerThreadStatusSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("notLoaded") }).strict(),
  z.object({ type: z.literal("idle") }).strict(),
  z.object({ type: z.literal("systemError") }).strict(),
  z
    .object({
      type: z.literal("active"),
      activeFlags: z.array(z.enum(["waitingOnApproval", "waitingOnUserInput"])),
    })
    .strict(),
]);

export function appServerThreadStatusFromUnknown(value: unknown) {
  const parsed = appServerThreadStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const appServerThreadSchema = z
  .object({
    id: z.string().min(1),
    extra: z.object({}).strict().nullable(),
    sessionId: z.string().min(1),
    forkedFromId: z.string().nullable(),
    parentThreadId: z.string().nullable(),
    preview: z.string(),
    ephemeral: z.boolean(),
    section: z
      .object({
        id: z.string().min(1),
        name: z.string().min(1),
        appearance: z
          .object({
            icon: z.string().nullable(),
            color: z.string().nullable(),
          })
          .strict()
          .nullable(),
      })
      .strict()
      .nullable(),
    sectionEnteredAt: z.number().nullable(),
    projectId: z.string().nullable(),
    historyMode: z.enum(["legacy", "paginated"]),
    modelProvider: z.string(),
    model: z.string().nullable(),
    reasoningEffort: z.string().nullable(),
    createdAt: z.number(),
    updatedAt: z.number(),
    recencyAt: z.number().nullable(),
    status: appServerThreadStatusSchema,
    path: z.string().nullable(),
    cwd: z.string(),
    cliVersion: z.string(),
    name: z.string().nullable(),
    source: z.union([
      z.enum(["cli", "vscode", "exec", "appServer", "unknown"]),
      z.object({ custom: z.string() }).strict(),
      z
        .object({
          subAgent: z.union([
            z.enum(["review", "compact", "memory_consolidation"]),
            z.object({ other: z.string() }).strict(),
            z
              .object({
                thread_spawn: z
                  .object({
                    parent_thread_id: z.string(),
                    depth: z.number(),
                    agent_path: z.string().nullable(),
                    agent_nickname: z.string().nullable(),
                    agent_role: z.string().nullable(),
                  })
                  .strict(),
              })
              .strict(),
          ]),
        })
        .strict(),
    ]),
    canAcceptDirectInput: z.boolean().nullable(),
    threadSource: z.string().nullable(),
    agentNickname: z.string().nullable(),
    agentRole: z.string().nullable(),
    gitInfo: z
      .object({
        sha: z.string().nullable(),
        branch: z.string().nullable(),
        originUrl: z.string().nullable(),
      })
      .strict()
      .nullable(),
    turns: z.array(threadTurnSchema),
  })
  .strict();

export const gatewayThreadSchema = appServerThreadSchema.omit({ projectId: true }).extend({
  appServerProjectId: z.string().nullable(),
  hostId: z.number().int().positive(),
  projectId: z.number().int().positive().nullable(),
  pinned: z.boolean(),
  title: z.string().nullable(),
});

export function parseAppServerThread(value: unknown): AppServerThread {
  return appServerThreadSchema.parse(value);
}

export function appServerThreadFromUnknown(value: unknown): AppServerThread | null {
  const result = appServerThreadSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function isAppServerSubAgentThread(
  thread: Pick<AppServerThread, "parentThreadId" | "source">,
) {
  const parentThreadId = thread.parentThreadId?.trim();
  return (
    (parentThreadId !== undefined && parentThreadId !== "") ||
    (typeof thread.source === "object" && "subAgent" in thread.source)
  );
}

const threadListPageSchema = z
  .object({
    data: z.array(appServerThreadSchema),
    nextCursor: z.string().nullable(),
  })
  .loose();

export interface AppServerThreadListPage {
  data: AppServerThread[];
  nextCursor: string | null;
}

export function parseThreadListPage(value: unknown): AppServerThreadListPage {
  const page = threadListPageSchema.parse(value);
  return { data: page.data, nextCursor: page.nextCursor };
}

export function threadHistoryItemFromUnknown(value: unknown): ThreadHistoryItem | null {
  const result = threadItemSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function threadHistoryTurnFromUnknown(value: unknown): ThreadHistoryTurn | null {
  const result = threadTurnSchema.safeParse(value);
  return result.success ? result.data : null;
}

export const threadGoalSchema = z
  .object({
    threadId: z.string().min(1),
    objective: z.string(),
    status: z.enum(["active", "paused", "blocked", "usageLimited", "budgetLimited", "complete"]),
    tokenBudget: z.number().nullable(),
    tokensUsed: z.number(),
    timeUsedSeconds: z.number(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .loose();

export function parseThreadGoalSetResponse(value: unknown) {
  return z.object({ goal: threadGoalSchema }).loose().parse(value);
}

export function parseThreadGoalGetResponse(value: unknown) {
  return z.object({ goal: threadGoalSchema.nullable() }).loose().parse(value);
}

export function parseThreadGoalClearResponse(value: unknown) {
  return z.object({ cleared: z.boolean() }).loose().parse(value);
}

export function parseTurnStartResponse(value: unknown) {
  return z.object({ turn: threadTurnSchema.optional() }).loose().parse(value);
}

export function parseTurnSteerResponse(value: unknown) {
  return z.object({ turnId: z.string().optional() }).loose().parse(value);
}

export function parseTurnSettingsUpdateResponse(value: unknown) {
  return z
    .object({ status: z.enum(["applied", "targetUnavailable"]) })
    .strict()
    .parse(value);
}

const mcpRuntimeStatusSchema = z.enum([
  "notStarted",
  "starting",
  "connected",
  "authenticationRequired",
  "failed",
  "cancelled",
  "disabled",
]);

export function parseMcpServerStatusPage(value: unknown) {
  return z
    .object({
      data: z.array(
        z
          .object({
            name: z.string().min(1),
            runtimeStatus: mcpRuntimeStatusSchema.nullable(),
            pluginId: z.string().nullable(),
            tools: z.record(z.string(), z.unknown()),
            authStatus: z.enum(["unknown", "unsupported", "notLoggedIn", "bearerToken", "oAuth"]),
          })
          .loose(),
      ),
      nextCursor: z.string().nullable(),
    })
    .loose()
    .parse(value);
}

export function parseEmptyAppServerResponse(value: unknown) {
  return z.object({}).loose().parse(value);
}

export function parseInitializeResponse(value: unknown) {
  return z.object({ userAgent: z.string().optional() }).loose().parse(value);
}

export interface LoadedThreadsPage {
  data: string[];
  nextCursor?: string | null;
}

export function parseLoadedThreadsPage(value: unknown): LoadedThreadsPage {
  return z
    .object({
      data: z.array(z.string()).default([]),
      nextCursor: z.string().nullable().optional(),
    })
    .loose()
    .parse(value);
}

export function threadGoalFromUnknown(value: unknown): ThreadGoal | null {
  const result = threadGoalSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function parseThreadStartResult(value: unknown) {
  const result = z.object({ thread: appServerThreadSchema }).loose().parse(value);
  return { raw: result, thread: result.thread };
}

export function parseThreadReadResult(value: unknown) {
  const result = z.object({ thread: appServerThreadSchema }).loose().parse(value);
  return { raw: result, thread: result.thread };
}

const threadResumeResultSchema = z
  .object({
    thread: appServerThreadSchema,
    model: z.string().min(1),
    reasoningEffort: z.string().nullable(),
    approvalPolicy: z.union([
      z.literal("untrusted"),
      z.literal("on-request"),
      z.literal("never"),
      z
        .object({
          granular: z
            .object({
              sandbox_approval: z.boolean(),
              rules: z.boolean(),
              skill_approval: z.boolean(),
              request_permissions: z.boolean(),
              mcp_elicitations: z.boolean(),
            })
            .strict(),
        })
        .strict(),
    ]),
    initialTurnsPage: turnsPageSchema.nullable().optional(),
    turnsBackwardsCursor: z.string().nullable().optional(),
  })
  .loose();

export function parseThreadResumeResult(value: unknown) {
  return threadResumeResultSchema.parse(value);
}
