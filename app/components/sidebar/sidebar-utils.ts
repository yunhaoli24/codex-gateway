import type { HostRecord, PinnedThreadRecord } from "./sidebar-types";

const threadStatusClassByStatus: Record<string, string> = {
  running: "text-primary",
  completedUnviewed: "text-primary",
  completed: "text-accent-green",
  failed: "text-destructive",
  interrupted: "text-accent-orange",
};

const threadStatusLabelKeyByStatus: Record<string, string> = {
  running: "app.running",
  completedUnviewed: "app.completedUnviewed",
  completed: "app.completed",
  failed: "app.failed",
  interrupted: "app.interrupted",
};

const busyHostConnectionStatuses = new Set([
  "checkingVersion",
  "upgrading",
  "restarting",
  "connecting",
  "mfaConnecting",
]);

const hostConnectionClassByStatus: Record<string, string> = {
  checkingVersion: "text-primary",
  upgrading: "text-primary",
  restarting: "text-primary",
  connecting: "text-primary",
  mfaConnecting: "text-accent-orange",
  mfaRequired: "text-accent-orange",
  connected: "text-accent-green",
  failed: "text-destructive",
};

const hostConnectionLabelKeyByStatus: Record<string, string> = {
  checkingVersion: "app.hostCheckingVersion",
  upgrading: "app.hostUpgrading",
  restarting: "app.hostRestarting",
  connecting: "app.hostConnecting",
  mfaConnecting: "app.hostMfaConnecting",
  mfaRequired: "app.hostMfaRequired",
  connected: "app.connected",
  failed: "app.hostConnectionFailed",
  idle: "app.hostDisconnected",
};

export function formatRelative(seconds?: number | null) {
  if (seconds === null || seconds === undefined || seconds <= 0) return "";
  const diff = Math.max(1, Math.floor(Date.now() / 1000 - seconds));
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604_800) return `${Math.floor(diff / 86_400)}d`;
  return `${Math.floor(diff / 604_800)}w`;
}

export function pinnedThreadId(thread: PinnedThreadRecord) {
  return thread.threadId;
}

export function pinnedThreadKey(thread: PinnedThreadRecord) {
  return `${thread.hostId}:${pinnedThreadId(thread)}`;
}

const sidebarLabelCollator = new Intl.Collator("zh-Hans-CN", {
  numeric: true,
  sensitivity: "base",
});

function compareSidebarLabels(left: string, right: string) {
  const localized = sidebarLabelCollator.compare(left, right);
  if (localized !== 0) return localized;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * Returns a display-only copy so deterministic sidebar ordering never rewrites the user's
 * persisted pin list. The explicit locale and identity tie-breakers keep the order identical
 * across browsers even when labels compare equal under case-insensitive collation.
 */
export function sortPinnedThreadsForDisplay(
  threads: readonly PinnedThreadRecord[],
  hosts: readonly HostRecord[],
) {
  const hostNames = new Map(hosts.map((host) => [host.id, host.name]));
  return threads.toSorted((left, right) => {
    const byHostName = compareSidebarLabels(
      hostNames.get(left.hostId) ?? "",
      hostNames.get(right.hostId) ?? "",
    );
    if (byHostName !== 0) return byHostName;

    const byTitle = compareSidebarLabels(left.title, right.title);
    if (byTitle !== 0) return byTitle;

    const byHostId = left.hostId - right.hostId;
    if (byHostId !== 0) return byHostId;
    return compareSidebarLabels(pinnedThreadId(left), pinnedThreadId(right));
  });
}

export function threadKey(hostId: number, threadId: string) {
  return `${hostId}:${threadId}`;
}

export function statusClass(status: string) {
  return threadStatusClassByStatus[status] ?? "text-ink-faint";
}

export function statusLabelKey(status: string) {
  return threadStatusLabelKeyByStatus[status] ?? "app.idle";
}

export function selectedRowClass(selected: boolean) {
  return selected ? "bg-primary/10 text-ink shadow-[inset_3px_0_0_var(--primary)]" : "";
}

export function hostConnectionClass(status: string) {
  return hostConnectionClassByStatus[status] ?? "text-ink-faint";
}

export function hostConnectionIsBusy(status: string) {
  return busyHostConnectionStatuses.has(status);
}

export function hostConnectionLabelKey(status: string) {
  return hostConnectionLabelKeyByStatus[status] ?? "app.hostDisconnected";
}
