import { z } from "zod";
import type { RealtimeClientMessage } from "../../types";
import { agentProviderIdSchema } from "../../agent/providers";
import {
  nonEmptyString,
  nonNegativeId,
  nullableString,
  positiveId,
  requestIdField,
  threadScopeFields,
} from "./common";

const approvalPolicy = z.enum(["untrusted", "on-request", "never"]).nullable().optional();
const imageInput = z
  .object({
    path: z.string().optional(),
    url: z.string().optional(),
    detail: z.enum(["low", "high", "auto", "original"]).optional(),
  })
  .strict();
const fileInput = z
  .object({
    path: z.string(),
    name: z.string(),
    mimeType: nullableString,
    size: z.number().nonnegative(),
    isImage: z.boolean(),
  })
  .strict();
const collaborationMode = z
  .object({
    mode: z.enum(["default", "plan"]),
    settings: z
      .object({
        model: z.string(),
        reasoningEffort: nullableString,
        developerInstructions: nullableString,
      })
      .strict(),
  })
  .strict()
  .nullable()
  .optional();

// Every browser-controlled field is validated at the WebSocket trust boundary. Do not replace
// this union with a type-only assertion: malformed terminal/browser/attachment fields would then
// enter handlers as trusted values and fail far from the peer that supplied them.
export const realtimeClientMessageSchema: z.ZodType<RealtimeClientMessage> = z.discriminatedUnion(
  "type",
  [
    z.object({ type: z.literal("auth.authenticate"), token: nonEmptyString }).strict(),
    z.object({ type: z.literal("host.lifecycle.subscribe") }).strict(),
    z.object({ type: z.literal("host.lifecycle.unsubscribe") }).strict(),
    z
      .object({ type: z.literal("host.metrics.subscribe"), ...requestIdField, hostId: positiveId })
      .strict(),
    z.object({ type: z.literal("host.metrics.unsubscribe"), hostId: positiveId }).strict(),
    z.object({ type: z.literal("host.mfa.connect"), hostId: positiveId }).strict(),
    z.object({ type: z.literal("host.mfa.submit"), hostId: positiveId, code: z.string() }).strict(),
    z.object({ type: z.literal("host.mfa.cancel"), hostId: positiveId }).strict(),
    z
      .object({
        type: z.literal("project.defaults.read"),
        ...requestIdField,
        hostId: positiveId,
        projectId: positiveId,
        provider: agentProviderIdSchema.optional(),
      })
      .strict(),
    z
      .object({ type: z.literal("tmux.sessions.subscribe"), ...requestIdField, hostId: positiveId })
      .strict(),
    z
      .object({ type: z.literal("tmux.sessions.refresh"), ...requestIdField, hostId: positiveId })
      .strict(),
    z.object({ type: z.literal("tmux.sessions.unsubscribe"), hostId: positiveId }).strict(),
    z
      .object({
        type: z.literal("thread.activate"),
        ...requestIdField,
        ...threadScopeFields,
        projectId: positiveId.nullable().optional(),
        limit: positiveId.optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("thread.subscribe"),
        ...threadScopeFields,
        afterId: nonNegativeId.optional(),
        afterEpoch: nonEmptyString.optional(),
      })
      .strict(),
    z.object({ type: z.literal("thread.unsubscribe"), ...threadScopeFields }).strict(),
    z
      .object({
        type: z.literal("thread.turns.load"),
        ...requestIdField,
        ...threadScopeFields,
        cursor: nullableString,
        limit: positiveId.optional(),
        sortDirection: z.enum(["asc", "desc"]).optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("thread.items.load"),
        ...requestIdField,
        ...threadScopeFields,
        turnId: nonEmptyString,
        cursor: nullableString,
        limit: positiveId.optional(),
        sortDirection: z.enum(["asc", "desc"]).optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("thread.start"),
        ...requestIdField,
        hostId: positiveId,
        projectId: positiveId.nullable().optional(),
        cwd: nullableString,
        provider: agentProviderIdSchema.optional(),
        model: nullableString,
        effort: nullableString,
        approvalPolicy,
      })
      .strict(),
    z
      .object({
        type: z.literal("turn.start"),
        ...requestIdField,
        ...threadScopeFields,
        projectId: positiveId,
        text: z.string(),
        clientUserMessageId: nullableString,
        cwd: nullableString,
        model: nullableString,
        effort: nullableString,
        approvalPolicy,
        collaborationMode,
        images: z.array(imageInput).optional(),
        files: z.array(fileInput).optional(),
        references: z
          .array(
            z
              .object({
                type: z.literal("file"),
                path: nonEmptyString,
                name: nonEmptyString,
              })
              .strict(),
          )
          .max(10)
          .optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("turn.steer"),
        ...requestIdField,
        ...threadScopeFields,
        projectId: positiveId,
        expectedTurnId: nonEmptyString,
        text: z.string(),
        clientUserMessageId: nullableString,
        images: z.array(imageInput).optional(),
        references: z
          .array(
            z
              .object({
                type: z.literal("file"),
                path: nonEmptyString,
                name: nonEmptyString,
              })
              .strict(),
          )
          .max(10)
          .optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("turn.interrupt"),
        ...requestIdField,
        ...threadScopeFields,
        turnId: nonEmptyString,
      })
      .strict(),
    z
      .object({
        type: z.literal("turn.settings.update"),
        ...requestIdField,
        ...threadScopeFields,
        turnId: nonEmptyString,
        model: nullableString,
        effort: nullableString,
      })
      .strict(),
    z
      .object({
        type: z.literal("mcp.status.list"),
        ...requestIdField,
        ...threadScopeFields,
      })
      .strict(),
    z
      .object({
        type: z.literal("mcp.event.stream.start"),
        ...requestIdField,
        ...threadScopeFields,
        server: nonEmptyString,
        subscriptionId: nonEmptyString,
        name: nonEmptyString,
        arguments: z.unknown(),
        meta: z.unknown().optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("mcp.event.stream.stop"),
        ...requestIdField,
        ...threadScopeFields,
        subscriptionId: nonEmptyString,
      })
      .strict(),
    z
      .object({
        type: z.literal("thread.goal.set"),
        ...requestIdField,
        ...threadScopeFields,
        objective: nullableString,
        status: z
          .enum(["active", "paused", "blocked", "usageLimited", "budgetLimited", "complete"])
          .nullable()
          .optional(),
        tokenBudget: z.number().int().positive().nullable().optional(),
      })
      .strict(),
    z
      .object({ type: z.literal("thread.goal.clear"), ...requestIdField, ...threadScopeFields })
      .strict(),
    z
      .object({ type: z.literal("thread.goal.get"), ...requestIdField, ...threadScopeFields })
      .strict(),
    z
      .object({
        type: z.literal("serverRequest.respond"),
        ...requestIdField,
        ...threadScopeFields,
        serverRequestId: z.union([z.string(), z.number()]),
        result: z.unknown().optional(),
        error: z
          .object({ code: z.number(), message: z.string(), data: z.unknown().optional() })
          .strict()
          .optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("terminal.open"),
        ...requestIdField,
        hostId: positiveId,
        projectId: positiveId.nullable().optional(),
        threadId: nullableString,
        cwd: nullableString,
        title: nullableString,
        scope: z.enum(["host", "project", "thread"]),
        cols: positiveId,
        rows: positiveId,
      })
      .strict(),
    z.object({ type: z.literal("terminal.list"), ...requestIdField }).strict(),
    z
      .object({ type: z.literal("terminal.input"), sessionId: nonEmptyString, data: z.string() })
      .strict(),
    z
      .object({
        type: z.literal("terminal.resize"),
        sessionId: nonEmptyString,
        cols: positiveId,
        rows: positiveId,
      })
      .strict(),
    z
      .object({ type: z.literal("terminal.close"), ...requestIdField, sessionId: nonEmptyString })
      .strict(),
    z
      .object({
        type: z.literal("browser.open"),
        ...requestIdField,
        hostId: positiveId,
        projectId: positiveId.nullable().optional(),
        threadId: nullableString,
        panelId: nonEmptyString,
        targetUrl: nonEmptyString,
        allowInsecureTls: z.boolean().optional(),
      })
      .strict(),
    z
      .object({ type: z.literal("browser.close"), ...requestIdField, sessionId: nonEmptyString })
      .strict(),
    z
      .object({
        type: z.literal("browser.allowInsecureTls"),
        ...requestIdField,
        sessionId: nonEmptyString,
        allowInsecureTls: z.boolean(),
      })
      .strict(),
    z
      .object({
        type: z.literal("file.search"),
        ...requestIdField,
        hostId: positiveId,
        projectId: positiveId,
        query: z.string().max(500),
        cancellationToken: nonEmptyString,
      })
      .strict(),
    z
      .object({
        type: z.literal("file.watch.subscribe"),
        ...requestIdField,
        ...threadScopeFields,
        projectId: positiveId,
        paths: z.array(nonEmptyString).min(1).max(256),
      })
      .strict(),
    z
      .object({
        type: z.literal("file.watch.unsubscribe"),
        ...threadScopeFields,
        projectId: positiveId,
        subscriptionId: nonEmptyString,
      })
      .strict(),
    z
      .object({
        type: z.literal("file.git.compare"),
        ...requestIdField,
        hostId: positiveId,
        projectId: positiveId,
        path: nonEmptyString,
      })
      .strict(),
    z
      .object({
        type: z.literal("file.git.workspace.inspect"),
        ...requestIdField,
        hostId: positiveId,
        projectId: positiveId,
        rootPath: nonEmptyString,
      })
      .strict(),
    z.object({ type: z.literal("ping"), nonce: z.string().optional() }).strict(),
  ],
);
