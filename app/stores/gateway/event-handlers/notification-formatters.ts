import { jsonPreview } from "@/utils/thread-items";
import type { GatewayStoreContext } from "../types";
import { pinnedKey } from "../thread-utils/identity";

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

export interface FormattedNotification {
  title: string;
  message: string;
  details?: string;
  level?: "info" | "warning";
}

type NotificationFormatter = (
  ctx: GatewayStoreContext,
  params: Record<string, any>,
  context?: NotificationFormatContext,
) => FormattedNotification;

interface NotificationFormatContext {
  hostId: number;
  threadId: string;
}

const warningMethods = new Set<VisibleNotificationMethod>([
  "warning",
  "guardianWarning",
  "deprecationNotice",
  "configWarning",
  "windows/worldWritableWarning",
]);

const formatters: Record<VisibleNotificationMethod, NotificationFormatter> = {
  "thread/archived": (ctx) => simple(ctx, "threadArchived"),
  "thread/deleted": (ctx) => simple(ctx, "threadDeleted", "warning"),
  "thread/unarchived": (ctx) => simple(ctx, "threadUnarchived"),
  "thread/closed": (ctx) => simple(ctx, "threadClosed"),
  "thread/name/updated": (ctx, params) =>
    simple(ctx, "threadNameUpdated", "info", { name: text(params.threadName) }),
  "thread/goal/updated": (ctx, params) =>
    simple(ctx, "threadGoalUpdated", "info", { goal: goalSummary(params.goal) }),
  "thread/goal/cleared": (ctx) => simple(ctx, "threadGoalCleared"),
  "skills/changed": (ctx) => simple(ctx, "skillsChanged"),
  "hook/started": (ctx, params) => hookNotification(ctx, params, "hookStarted"),
  "hook/completed": (ctx, params) => hookNotification(ctx, params, "hookCompleted"),
  "item/autoApprovalReview/started": (ctx, params) => guardianReview(ctx, params, "started"),
  "item/autoApprovalReview/completed": (ctx, params) => guardianReview(ctx, params, "completed"),
  "rawResponseItem/completed": (ctx, params) =>
    simple(ctx, "rawResponseItemCompleted", "info", { item: itemSummary(params.item) }),
  "item/commandExecution/terminalInteraction": (ctx, params) => terminalInteraction(ctx, params),
  "item/mcpToolCall/progress": (ctx, params) =>
    simple(ctx, "mcpToolCallProgress", "info", { message: text(params.message) }),
  "mcpServer/oauthLogin/completed": (ctx, params) =>
    simple(
      ctx,
      params.success ? "mcpOauthLoginCompleted" : "mcpOauthLoginFailed",
      params.success ? "info" : "warning",
      {
        server: text(params.name),
        error: text(params.error),
      },
    ),
  "mcpServer/startupStatus/updated": (ctx, params) =>
    simple(ctx, "mcpServerStatusUpdated", params.error ? "warning" : "info", {
      server: text(params.name),
      status: text(params.status),
      error: text(params.error),
    }),
  "account/updated": (ctx, params) =>
    simple(ctx, "accountUpdated", "info", {
      authMode: text(params.authMode),
      planType: text(params.planType),
    }),
  "account/rateLimits/updated": (ctx, params) => rateLimitsUpdated(ctx, params),
  "app/list/updated": (ctx, params) =>
    simple(ctx, "appListUpdated", "info", { count: count(params.data) }),
  "remoteControl/status/changed": (ctx, params) =>
    simple(ctx, "remoteControlStatusChanged", "info", {
      server: text(params.serverName),
      status: text(params.status),
    }),
  "externalAgentConfig/import/progress": (ctx, params) =>
    externalAgentConfigImport(ctx, params, "externalAgentConfigImportProgress"),
  "externalAgentConfig/import/completed": (ctx, params) =>
    externalAgentConfigImport(ctx, params, "externalAgentConfigImportCompleted"),
  "fs/changed": (ctx, params) =>
    simple(ctx, "fsChanged", "info", {
      count: count(params.changedPaths),
      paths: list(params.changedPaths, 3),
    }),
  "item/reasoning/summaryPartAdded": (ctx, params) =>
    simple(ctx, "reasoningSummaryPartAdded", "info", { index: numberText(params.summaryIndex) }),
  "thread/compacted": (ctx) => simple(ctx, "threadCompacted"),
  "model/rerouted": (ctx, params) =>
    simple(ctx, "modelRerouted", "info", {
      from: text(params.fromModel),
      to: text(params.toModel),
      reason: text(params.reason),
    }),
  "model/verification": (ctx, params) =>
    simple(ctx, "modelVerification", "info", {
      count: count(params.verifications),
      items: verificationSummary(params.verifications),
    }),
  "turn/moderationMetadata": (ctx, params) => moderationMetadata(ctx, params),
  "model/safetyBuffering/updated": (ctx, params) => modelSafetyBuffering(ctx, params),
  warning: (ctx, params) => warningNotification(ctx, "warning", params),
  guardianWarning: (ctx, params) => warningNotification(ctx, "guardianWarning", params),
  deprecationNotice: (ctx, params) =>
    withDetails(
      simple(ctx, "deprecationNotice", "warning", { summary: text(params.summary) }),
      params.details,
    ),
  configWarning: (ctx, params) =>
    withDetails(
      simple(ctx, "configWarning", "warning", {
        summary: text(params.summary),
        path: text(params.path),
      }),
      [params.details, configRange(params.range)].filter(Boolean).join("\n"),
    ),
  "fuzzyFileSearch/sessionUpdated": (ctx, params) =>
    simple(ctx, "fuzzyFileSearchUpdated", "info", {
      query: text(params.query),
      count: count(params.files),
    }),
  "fuzzyFileSearch/sessionCompleted": (ctx) => simple(ctx, "fuzzyFileSearchCompleted"),
  "thread/realtime/started": (ctx, params) =>
    simple(ctx, "realtimeStarted", "info", { session: text(params.realtimeSessionId) }),
  "thread/realtime/closed": (ctx, params) =>
    simple(ctx, "realtimeClosed", "info", { reason: text(params.reason) }),
  "windows/worldWritableWarning": (ctx, params) =>
    simple(ctx, "windowsWorldWritableWarning", "warning", {
      count: count(params.samplePaths) + numeric(params.extraCount),
      paths: list(params.samplePaths, 3),
    }),
  "windowsSandbox/setupCompleted": (ctx, params) =>
    simple(
      ctx,
      params.success ? "windowsSandboxSetupCompleted" : "windowsSandboxSetupFailed",
      params.success ? "info" : "warning",
      {
        mode: text(params.mode),
        error: text(params.error),
      },
    ),
  "account/login/completed": (ctx, params) =>
    simple(
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

function simple(
  ctx: GatewayStoreContext,
  key: string,
  level: "info" | "warning" = "info",
  values: Record<string, unknown> = {},
): FormattedNotification {
  return {
    title: ctx.t(`app.notifications.${key}.title`, values),
    message: ctx.t(`app.notifications.${key}.message`, values),
    level,
  };
}

function terminalInteraction(
  ctx: GatewayStoreContext,
  params: Record<string, any>,
  context?: NotificationFormatContext,
): FormattedNotification {
  const stdin = text(params.stdin);
  if (!stdin) {
    return simple(ctx, "terminalWait", "info", {
      command: commandForTerminalInteraction(ctx, params, context),
      processId: text(params.processId),
    });
  }
  return simple(ctx, "terminalInteraction", "info", {
    command: commandForTerminalInteraction(ctx, params, context),
    processId: text(params.processId),
    stdin: truncate(stdin, 120),
  });
}

function commandForTerminalInteraction(
  ctx: GatewayStoreContext,
  params: Record<string, any>,
  context?: NotificationFormatContext,
) {
  const processId = text(params.processId);
  const lookupContext = context ?? {
    hostId: ctx.state.selectedHostId ?? 0,
    threadId: text(params.threadId) || ctx.state.selectedThreadId || "",
  };
  const command = findCommandItem(
    ctx,
    lookupContext.hostId,
    lookupContext.threadId,
    text(params.itemId),
    processId,
  )?.command;
  return truncate(
    text(command) || ctx.t("app.notifications.terminalProcessFallback", { processId }),
    140,
  );
}

function findCommandItem(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
  itemId: string,
  processId: string,
) {
  const histories = [
    hostId === ctx.state.selectedHostId && threadId === ctx.state.selectedThreadId
      ? ctx.state.history
      : null,
    ctx.state.threadSnapshots[pinnedKey(hostId, threadId)]?.history,
    ctx.state.threadPreviews[pinnedKey(hostId, threadId)]?.history,
  ];
  for (const history of histories) {
    const item = findCommandItemInHistory(history, itemId, processId);
    if (item) {
      return item;
    }
  }
  return null;
}

function findCommandItemInHistory(history: unknown, itemId: string, processId: string) {
  const turns = (history as any)?.thread?.turns ?? (history as any)?.turns ?? [];
  for (const turn of Array.isArray(turns) ? turns : []) {
    for (const item of Array.isArray(turn?.items) ? turn.items : []) {
      if (
        item?.type === "commandExecution" &&
        ((itemId && String(item.id) === itemId) ||
          (processId && String(item.processId) === processId))
      ) {
        return item;
      }
    }
  }
  return null;
}

function withDetails(notification: FormattedNotification, details: unknown) {
  return details ? { ...notification, details: text(details) } : notification;
}

function hookNotification(ctx: GatewayStoreContext, params: Record<string, any>, key: string) {
  const run = params.run || {};
  return withDetails(
    simple(ctx, key, run.status === "failed" ? "warning" : "info", {
      event: text(run.eventName),
      status: text(run.status),
      message: text(run.statusMessage),
    }),
    run.entries?.length ? jsonPreview(run.entries) : null,
  );
}

function guardianReview(
  ctx: GatewayStoreContext,
  params: Record<string, any>,
  phase: "started" | "completed",
) {
  const review = params.review || {};
  return withDetails(
    simple(ctx, phase === "started" ? "guardianReviewStarted" : "guardianReviewCompleted", "info", {
      action: text(params.action),
      status: text(review.status),
      risk: text(review.riskLevel),
      rationale: text(review.rationale),
    }),
    jsonPreview({
      reviewId: params.reviewId,
      targetItemId: params.targetItemId,
      decisionSource: params.decisionSource,
      userAuthorization: review.userAuthorization,
    }),
  );
}

function rateLimitsUpdated(ctx: GatewayStoreContext, params: Record<string, any>) {
  const limits = params.rateLimits || {};
  return withDetails(
    simple(ctx, "accountRateLimitsUpdated", limits.rateLimitReachedType ? "warning" : "info", {
      plan: text(limits.planType),
      limit: text(limits.limitName || limits.limitId),
      reached: text(limits.rateLimitReachedType),
    }),
    jsonPreview(limits),
  );
}

function externalAgentConfigImport(
  ctx: GatewayStoreContext,
  params: Record<string, any>,
  key: string,
) {
  const results = Array.isArray(params.itemTypeResults) ? params.itemTypeResults : [];
  const successes = results.reduce((total, result) => total + count(result.successes), 0);
  const failures = results.reduce((total, result) => total + count(result.failures), 0);
  return withDetails(
    simple(ctx, key, failures ? "warning" : "info", { successes, failures }),
    jsonPreview(results),
  );
}

function moderationMetadata(
  ctx: GatewayStoreContext,
  params: Record<string, any>,
): FormattedNotification {
  const metadata = params.metadata;
  const summary = moderationSummary(metadata);
  return withDetails(
    simple(ctx, "turnModerationMetadata", "info", { summary }),
    jsonPreview(metadata),
  );
}

function modelSafetyBuffering(ctx: GatewayStoreContext, params: Record<string, any>) {
  return withDetails(
    simple(
      ctx,
      params.showBufferingUi ? "modelSafetyBufferingEnabled" : "modelSafetyBufferingDisabled",
      "info",
      {
        model: text(params.model),
        fasterModel: text(params.fasterModel),
        reasons: list(params.reasons, 3),
        useCases: list(params.useCases, 3),
      },
    ),
    jsonPreview({
      useCases: params.useCases,
      reasons: params.reasons,
      fasterModel: params.fasterModel,
    }),
  );
}

function warningNotification(ctx: GatewayStoreContext, key: string, params: Record<string, any>) {
  return simple(ctx, key, "warning", { message: text(params.message) });
}

function moderationSummary(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") {
    return text(metadata) || "metadata";
  }
  const record = metadata as Record<string, any>;
  const flagged = findFirst(record, ["flagged", "blocked", "unsafe", "moderated"]);
  const model = findFirst(record, ["model", "moderationModel", "classifier"]);
  const categoryKeys = extractCategoryKeys(record);
  return [
    flagged === undefined ? null : `flagged=${String(flagged)}`,
    model ? `model=${String(model)}` : null,
    categoryKeys.length ? `categories=${categoryKeys.slice(0, 4).join(", ")}` : null,
    `keys=${Object.keys(record).slice(0, 6).join(", ")}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function extractCategoryKeys(record: Record<string, any>) {
  const categories = findFirst(record, ["categories", "category_scores", "categoryScores"]);
  if (categories && typeof categories === "object" && !Array.isArray(categories)) {
    return Object.entries(categories)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key);
  }
  return [];
}

function findFirst(record: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }
  return undefined;
}

function verificationSummary(value: unknown) {
  if (!Array.isArray(value) || !value.length) {
    return "";
  }
  return value
    .slice(0, 3)
    .map((item) => text(item?.status || item?.result || item?.model || item?.id || item))
    .filter(Boolean)
    .join(", ");
}

function itemSummary(item: unknown) {
  if (!item || typeof item !== "object") {
    return text(item);
  }
  const record = item as Record<string, any>;
  return [record.type, record.id].filter(Boolean).join(" · ");
}

function goalSummary(goal: unknown) {
  if (!goal || typeof goal !== "object") {
    return text(goal);
  }
  const record = goal as Record<string, any>;
  return text(record.summary || record.text || record.title || record.name || goal);
}

function configRange(range: unknown) {
  if (!range || typeof range !== "object") {
    return "";
  }
  const value = range as Record<string, any>;
  return jsonPreview(value);
}

function list(value: unknown, limit: number) {
  if (!Array.isArray(value)) {
    return text(value);
  }
  const visible = value.slice(0, limit).map(text).filter(Boolean);
  const extra = value.length - visible.length;
  return extra > 0 ? `${visible.join(", ")} +${extra}` : visible.join(", ");
}

function count(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberText(value: unknown) {
  return typeof value === "number" || typeof value === "bigint" ? String(value) : text(value);
}

function truncate(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function text(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return jsonPreview(value);
}
