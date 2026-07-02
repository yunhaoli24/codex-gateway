import type { GatewayStoreContext } from "../types";
import {
  configRange,
  count,
  goalSummary,
  itemSummary,
  list,
  numberText,
  numeric,
  simpleNotification,
  text,
  verificationSummary,
  withDetails,
  type NotificationFormatContext,
  type NotificationFormatter,
} from "./notification-formatters/common";
import {
  externalAgentConfigImportNotification,
  guardianReviewNotification,
  hookNotification,
  modelSafetyBufferingNotification,
  moderationMetadataNotification,
  rateLimitsUpdatedNotification,
  warningNotification,
} from "./notification-formatters/rich";
import { terminalInteractionNotification } from "./notification-formatters/terminal";

export const visibleNotificationMethods = [
  "thread/archived",
  "thread/deleted",
  "thread/unarchived",
  "thread/closed",
  "thread/name/updated",
  "thread/goal/updated",
  "thread/goal/cleared",
  "skills/changed",
  "hook/started",
  "hook/completed",
  "item/autoApprovalReview/started",
  "item/autoApprovalReview/completed",
  "rawResponseItem/completed",
  "item/commandExecution/terminalInteraction",
  "item/mcpToolCall/progress",
  "mcpServer/oauthLogin/completed",
  "mcpServer/startupStatus/updated",
  "account/updated",
  "account/rateLimits/updated",
  "app/list/updated",
  "remoteControl/status/changed",
  "externalAgentConfig/import/progress",
  "externalAgentConfig/import/completed",
  "fs/changed",
  "item/reasoning/summaryPartAdded",
  "thread/compacted",
  "model/rerouted",
  "model/verification",
  "turn/moderationMetadata",
  "model/safetyBuffering/updated",
  "warning",
  "guardianWarning",
  "deprecationNotice",
  "configWarning",
  "fuzzyFileSearch/sessionUpdated",
  "fuzzyFileSearch/sessionCompleted",
  "thread/realtime/started",
  "thread/realtime/closed",
  "windows/worldWritableWarning",
  "windowsSandbox/setupCompleted",
  "account/login/completed",
] as const;

export type VisibleNotificationMethod = (typeof visibleNotificationMethods)[number];

const warningMethods = new Set<VisibleNotificationMethod>([
  "warning",
  "guardianWarning",
  "deprecationNotice",
  "configWarning",
  "windows/worldWritableWarning",
]);

const formatters: Record<VisibleNotificationMethod, NotificationFormatter> = {
  "thread/archived": (ctx) => simpleNotification(ctx, "threadArchived"),
  "thread/deleted": (ctx) => simpleNotification(ctx, "threadDeleted", "warning"),
  "thread/unarchived": (ctx) => simpleNotification(ctx, "threadUnarchived"),
  "thread/closed": (ctx) => simpleNotification(ctx, "threadClosed"),
  "thread/name/updated": (ctx, params) =>
    simpleNotification(ctx, "threadNameUpdated", "info", { name: text(params.threadName) }),
  "thread/goal/updated": (ctx, params) =>
    simpleNotification(ctx, "threadGoalUpdated", "info", { goal: goalSummary(params.goal) }),
  "thread/goal/cleared": (ctx) => simpleNotification(ctx, "threadGoalCleared"),
  "skills/changed": (ctx) => simpleNotification(ctx, "skillsChanged"),
  "hook/started": (ctx, params) => hookNotification(ctx, params, "hookStarted"),
  "hook/completed": (ctx, params) => hookNotification(ctx, params, "hookCompleted"),
  "item/autoApprovalReview/started": (ctx, params) =>
    guardianReviewNotification(ctx, params, "started"),
  "item/autoApprovalReview/completed": (ctx, params) =>
    guardianReviewNotification(ctx, params, "completed"),
  "rawResponseItem/completed": (ctx, params) =>
    simpleNotification(ctx, "rawResponseItemCompleted", "info", {
      item: itemSummary(params.item),
    }),
  "item/commandExecution/terminalInteraction": terminalInteractionNotification,
  "item/mcpToolCall/progress": (ctx, params) =>
    simpleNotification(ctx, "mcpToolCallProgress", "info", { message: text(params.message) }),
  "mcpServer/oauthLogin/completed": (ctx, params) =>
    simpleNotification(
      ctx,
      params.success ? "mcpOauthLoginCompleted" : "mcpOauthLoginFailed",
      params.success ? "info" : "warning",
      {
        server: text(params.name),
        error: text(params.error),
      },
    ),
  "mcpServer/startupStatus/updated": (ctx, params) =>
    simpleNotification(ctx, "mcpServerStatusUpdated", params.error ? "warning" : "info", {
      server: text(params.name),
      status: text(params.status),
      error: text(params.error),
    }),
  "account/updated": (ctx, params) =>
    simpleNotification(ctx, "accountUpdated", "info", {
      authMode: text(params.authMode),
      planType: text(params.planType),
    }),
  "account/rateLimits/updated": rateLimitsUpdatedNotification,
  "app/list/updated": (ctx, params) =>
    simpleNotification(ctx, "appListUpdated", "info", { count: count(params.data) }),
  "remoteControl/status/changed": (ctx, params) =>
    simpleNotification(ctx, "remoteControlStatusChanged", "info", {
      server: text(params.serverName),
      status: text(params.status),
    }),
  "externalAgentConfig/import/progress": (ctx, params) =>
    externalAgentConfigImportNotification(ctx, params, "externalAgentConfigImportProgress"),
  "externalAgentConfig/import/completed": (ctx, params) =>
    externalAgentConfigImportNotification(ctx, params, "externalAgentConfigImportCompleted"),
  "fs/changed": (ctx, params) =>
    simpleNotification(ctx, "fsChanged", "info", {
      count: count(params.changedPaths),
      paths: list(params.changedPaths, 3),
    }),
  "item/reasoning/summaryPartAdded": (ctx, params) =>
    simpleNotification(ctx, "reasoningSummaryPartAdded", "info", {
      index: numberText(params.summaryIndex),
    }),
  "thread/compacted": (ctx) => simpleNotification(ctx, "threadCompacted"),
  "model/rerouted": (ctx, params) =>
    simpleNotification(ctx, "modelRerouted", "info", {
      from: text(params.fromModel),
      to: text(params.toModel),
      reason: text(params.reason),
    }),
  "model/verification": (ctx, params) =>
    simpleNotification(ctx, "modelVerification", "info", {
      count: count(params.verifications),
      items: verificationSummary(params.verifications),
    }),
  "turn/moderationMetadata": moderationMetadataNotification,
  "model/safetyBuffering/updated": modelSafetyBufferingNotification,
  warning: (ctx, params) => warningNotification(ctx, "warning", params),
  guardianWarning: (ctx, params) => warningNotification(ctx, "guardianWarning", params),
  deprecationNotice: (ctx, params) =>
    withDetails(
      simpleNotification(ctx, "deprecationNotice", "warning", {
        summary: text(params.summary),
      }),
      params.details,
    ),
  configWarning: (ctx, params) =>
    withDetails(
      simpleNotification(ctx, "configWarning", "warning", {
        summary: text(params.summary),
        path: text(params.path),
      }),
      [params.details, configRange(params.range)].filter(Boolean).join("\n"),
    ),
  "fuzzyFileSearch/sessionUpdated": (ctx, params) =>
    simpleNotification(ctx, "fuzzyFileSearchUpdated", "info", {
      query: text(params.query),
      count: count(params.files),
    }),
  "fuzzyFileSearch/sessionCompleted": (ctx) => simpleNotification(ctx, "fuzzyFileSearchCompleted"),
  "thread/realtime/started": (ctx, params) =>
    simpleNotification(ctx, "realtimeStarted", "info", {
      session: text(params.realtimeSessionId),
    }),
  "thread/realtime/closed": (ctx, params) =>
    simpleNotification(ctx, "realtimeClosed", "info", { reason: text(params.reason) }),
  "windows/worldWritableWarning": (ctx, params) =>
    simpleNotification(ctx, "windowsWorldWritableWarning", "warning", {
      count: count(params.samplePaths) + numeric(params.extraCount),
      paths: list(params.samplePaths, 3),
    }),
  "windowsSandbox/setupCompleted": (ctx, params) =>
    simpleNotification(
      ctx,
      params.success ? "windowsSandboxSetupCompleted" : "windowsSandboxSetupFailed",
      params.success ? "info" : "warning",
      {
        mode: text(params.mode),
        error: text(params.error),
      },
    ),
  "account/login/completed": (ctx, params) =>
    simpleNotification(
      ctx,
      params.success ? "accountLoginCompleted" : "accountLoginFailed",
      params.success ? "info" : "warning",
      {
        loginId: text(params.loginId),
        error: text(params.error),
      },
    ),
};

export function formatNotification(
  ctx: GatewayStoreContext,
  method: VisibleNotificationMethod,
  params: Record<string, any>,
  context?: NotificationFormatContext,
) {
  const formatted = formatters[method](ctx, params, context);
  return {
    ...formatted,
    level: formatted.level ?? (warningMethods.has(method) ? "warning" : "info"),
  };
}
