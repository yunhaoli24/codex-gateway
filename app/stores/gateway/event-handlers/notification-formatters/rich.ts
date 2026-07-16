import { jsonPreview } from "@/utils/thread-items";
import {
  count,
  list,
  simpleNotification,
  text,
  withDetails,
  type FormattedNotification,
  type TranslationFunction,
} from "./common";

export function hookNotification(t: TranslationFunction, params: Record<string, any>, key: string) {
  const run = params.run || {};
  return withDetails(
    simpleNotification(t, key, run.status === "failed" ? "warning" : "info", {
      event: text(run.eventName),
      status: text(run.status),
      message: text(run.statusMessage),
    }),
    run.entries?.length ? jsonPreview(run.entries) : null,
  );
}

export function guardianReviewNotification(
  t: TranslationFunction,
  params: Record<string, any>,
  phase: "started" | "completed",
) {
  const review = params.review || {};
  return withDetails(
    simpleNotification(
      t,
      phase === "started" ? "guardianReviewStarted" : "guardianReviewCompleted",
      "info",
      {
        action: text(params.action),
        status: text(review.status),
        risk: text(review.riskLevel),
        rationale: text(review.rationale),
      },
    ),
    jsonPreview({
      reviewId: params.reviewId,
      targetItemId: params.targetItemId,
      decisionSource: params.decisionSource,
      userAuthorization: review.userAuthorization,
    }),
  );
}

export function rateLimitsUpdatedNotification(t: TranslationFunction, params: Record<string, any>) {
  const limits = params.rateLimits || {};
  return withDetails(
    simpleNotification(
      t,
      "accountRateLimitsUpdated",
      limits.rateLimitReachedType ? "warning" : "info",
      {
        plan: text(limits.planType),
        limit: text(limits.limitName || limits.limitId),
        reached: text(limits.rateLimitReachedType),
      },
    ),
    jsonPreview(limits),
  );
}

export function externalAgentConfigImportNotification(
  t: TranslationFunction,
  params: Record<string, any>,
  key: string,
) {
  const results = Array.isArray(params.itemTypeResults) ? params.itemTypeResults : [];
  const successes = results.reduce((total, result) => total + count(result.successes), 0);
  const failures = results.reduce((total, result) => total + count(result.failures), 0);
  return withDetails(
    simpleNotification(t, key, failures ? "warning" : "info", { successes, failures }),
    jsonPreview(results),
  );
}

export function moderationMetadataNotification(
  t: TranslationFunction,
  params: Record<string, any>,
): FormattedNotification {
  const metadata = params.metadata;
  const summary = moderationSummary(metadata);
  return withDetails(
    simpleNotification(t, "turnModerationMetadata", "info", { summary }),
    jsonPreview(metadata),
  );
}

export function modelSafetyBufferingNotification(
  t: TranslationFunction,
  params: Record<string, any>,
) {
  return withDetails(
    simpleNotification(
      t,
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

export function warningNotification(
  t: TranslationFunction,
  key: string,
  params: Record<string, any>,
) {
  return simpleNotification(t, key, "warning", { message: text(params.message) });
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
