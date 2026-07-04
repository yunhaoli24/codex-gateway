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
]);

const hostConnectionClassByStatus: Record<string, string> = {
  checkingVersion: "text-primary",
  upgrading: "text-primary",
  restarting: "text-primary",
  connecting: "text-primary",
  connected: "text-accent-green",
  failed: "text-destructive",
};

const hostConnectionLabelKeyByStatus: Record<string, string> = {
  checkingVersion: "app.hostCheckingVersion",
  upgrading: "app.hostUpgrading",
  restarting: "app.hostRestarting",
  connecting: "app.hostConnecting",
  connected: "app.connected",
  failed: "app.hostConnectionFailed",
  idle: "app.hostDisconnected",
};

export function formatRelative(seconds?: number | null) {
  if (!seconds) return "";
  const diff = Math.max(1, Math.floor(Date.now() / 1000 - seconds));
  if (diff < 3600) return `${Math.floor(diff / 60) || 1}m`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604_800) return `${Math.floor(diff / 86_400)}d`;
  return `${Math.floor(diff / 604_800)}w`;
}

export function pinnedThreadId(thread: any) {
  return String(thread.threadId ?? thread.id ?? "");
}

export function pinnedThreadKey(thread: any) {
  return `${thread.hostId}:${pinnedThreadId(thread)}`;
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
