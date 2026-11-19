import type { GatewayTranslate } from "@/composables/i18n/useGatewayTranslator";

const statusKeys: Record<string, string> = {
  idle: "app.idle",
  inProgress: "app.running",
  running: "app.running",
  active: "app.goalStatusActive",
  completed: "app.completed",
  complete: "app.completed",
  failed: "app.failed",
  errored: "app.failed",
  interrupted: "app.interrupted",
  paused: "app.goalStatusPaused",
  blocked: "app.goalStatusBlocked",
  usageLimited: "app.goalStatusUsageLimited",
  budgetLimited: "app.goalStatusBudgetLimited",
  pending: "app.itemStatus.pending",
  waitingForClient: "app.itemStatus.waitingForClient",
  waitingForApproval: "app.itemStatus.waitingForApproval",
  approved: "app.itemStatus.approved",
  accepted: "app.itemStatus.approved",
  rejected: "app.itemStatus.rejected",
  declined: "app.itemStatus.rejected",
  cancelled: "app.itemStatus.cancelled",
  canceled: "app.itemStatus.cancelled",
  resolved: "app.itemStatus.resolved",
  stopped: "app.itemStatus.stopped",
  shutdown: "app.itemStatus.stopped",
  notFound: "app.itemStatus.notFound",
  spawning: "app.itemStatus.starting",
  initializing: "app.itemStatus.starting",
};

export function threadItemStatusLabel(status: unknown, t: GatewayTranslate) {
  if (typeof status !== "string") return "";
  const key = statusKeys[status];
  return key === undefined ? status : t(key);
}
