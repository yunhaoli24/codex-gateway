import type { HostWithSecret } from "../infra/ssh/ssh-types";
import { notificationCenter } from "../notifications/notification-center";
import { TmuxMonitorRepository } from "./repository";
import type { StoredTmuxMonitor } from "./types";
import { firstNonEmptyString } from "~~/shared/utils/strings";

export class TmuxMonitorNotifier {
  private readonly pendingMonitorIds = new Set<number>();

  constructor(private readonly repository: TmuxMonitorRepository) {}

  async publishCompletion(host: HostWithSecret, monitor: StoredTmuxMonitor) {
    if (this.pendingMonitorIds.has(monitor.id)) return;
    const persisted = this.repository.getOwned(monitor.userId, monitor.id);
    if (persisted === null || persisted.notificationSentAt !== null) return;

    this.pendingMonitorIds.add(monitor.id);
    try {
      await notificationCenter.publish({
        key: `tmux-monitor:${monitor.userId}:${monitor.id}:completed`,
        title: `Tmux 任务已结束 · ${firstNonEmptyString([host.name, host.sshHost]) ?? String(host.id)} · ${monitor.sessionName}`,
        body: [
          `Host：${firstNonEmptyString([host.name, host.sshHost]) ?? String(host.id)}`,
          `Thread：${threadLabel(monitor)}`,
          `Tmux：${monitor.sessionName}`,
          `状态：${reasonLabel(monitor)}`,
        ].join("\n"),
        translation: {
          kind: "tmuxCompleted",
          values: {
            host: firstNonEmptyString([host.name, host.sshHost]) ?? String(host.id),
            thread: monitor.threadId === null ? "" : threadLabel(monitor),
            session: monitor.sessionName,
            reason: monitor.completionReason ?? "completed",
          },
        },
        group: "tmux-monitor",
        target: {
          kind: "tmuxMonitor",
          hostId: monitor.hostId,
          monitorId: monitor.id,
          threadId: monitor.threadId,
        },
      });
      // Browser fan-out is synchronous and Bark resolves only after delivery (or when disabled).
      // Persist acknowledgement last so a crash or exhausted Bark retry leaves this row eligible
      // for the next poll instead of permanently losing the notification.
      this.repository.markNotificationSent(monitor.userId, monitor.id);
    } finally {
      this.pendingMonitorIds.delete(monitor.id);
    }
  }
}

function threadLabel(monitor: StoredTmuxMonitor) {
  if (monitor.threadId === null) return "主机级监控";
  return firstNonEmptyString([monitor.threadTitle, monitor.threadId]) ?? monitor.threadId;
}

function reasonLabel(monitor: StoredTmuxMonitor) {
  switch (monitor.completionReason) {
    case "returnedToShell":
      return "已返回 Shell";
    case "sessionExited":
      return "Session 已退出";
    case "paneExited":
      return "Pane 已退出";
    case "paneReplaced":
      return "Pane 已被替换";
    case "cancelled":
    case null:
      return "监控已完成";
  }
}
