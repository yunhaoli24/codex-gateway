import type { HostWithSecret } from "../infra/ssh-types";
import { notificationCenter } from "../notifications/notification-center";
import { TmuxMonitorRepository } from "./repository";
import type { StoredTmuxMonitor } from "./types";

export class TmuxMonitorNotifier {
  constructor(private readonly repository: TmuxMonitorRepository) {}

  publishCompletion(host: HostWithSecret, monitor: StoredTmuxMonitor) {
    if (!this.repository.claimNotification(monitor.userId, monitor.id)) return;
    notificationCenter.publish({
      key: `tmux-monitor:${monitor.userId}:${monitor.id}:completed`,
      title: `Tmux 任务已结束 · ${host.name || host.sshHost} · ${monitor.sessionName}`,
      body: [
        `Host：${host.name || host.sshHost}`,
        `Thread：${threadLabel(monitor)}`,
        `Tmux：${monitor.sessionName}`,
        `状态：${reasonLabel(monitor)}`,
      ].join("\n"),
      group: "tmux-monitor",
      target: {
        kind: "tmuxMonitor",
        hostId: monitor.hostId,
        monitorId: monitor.id,
        projectId: monitor.projectId,
        threadId: monitor.threadId,
      },
    });
  }
}

function threadLabel(monitor: StoredTmuxMonitor) {
  if (!monitor.threadId) return "主机级监控";
  return monitor.threadTitle || monitor.threadId;
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
    default:
      return "监控已完成";
  }
}
