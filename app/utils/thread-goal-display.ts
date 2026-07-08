import type { ThreadGoalStatus } from "~~/shared/types";

export function goalStatusI18nKey(status: ThreadGoalStatus) {
  const keys: Record<ThreadGoalStatus, string> = {
    active: "app.goalStatusActive",
    paused: "app.goalStatusPaused",
    blocked: "app.goalStatusBlocked",
    usageLimited: "app.goalStatusUsageLimited",
    budgetLimited: "app.goalStatusBudgetLimited",
    complete: "app.goalStatusComplete",
  };
  return keys[status];
}

export function formatGoalElapsed(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
}

export function formatGoalTokens(value: number) {
  return value.toLocaleString();
}
