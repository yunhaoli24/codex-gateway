import type {
  TmuxMonitor,
  TmuxMonitorCompletionReason,
  TmuxMonitorListResult,
  TmuxPaneSnapshot,
} from "~~/shared/types";
import { gatewayDatabase } from "../storage/database";
import type { StoredTmuxMonitor, TmuxMonitorHostGroup } from "./types";

const HISTORY_LIMIT = 100;

export class TmuxMonitorRepository {
  listForHost(userId: number, hostId: number): TmuxMonitorListResult {
    const rows = gatewayDatabase()
      .prepare(
        `SELECT * FROM tmux_monitors
         WHERE user_id = ? AND host_id = ?
         ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END,
           CASE WHEN status = 'active' THEN created_at ELSE completed_at END DESC`,
      )
      .all(userId, hostId)
      .map(mapMonitor);
    return {
      active: rows.filter((row) => row.status === "active"),
      history: rows.filter((row) => row.status !== "active").slice(0, HISTORY_LIMIT),
    };
  }

  create(userId: number, hostId: number, pane: TmuxPaneSnapshot): StoredTmuxMonitor {
    const now = new Date().toISOString();
    const result = gatewayDatabase()
      .prepare(
        `INSERT INTO tmux_monitors (
          user_id, host_id, session_name, session_id, session_created,
          window_index, window_name, pane_index, pane_id, pane_pid,
          initial_command, last_command, status, created_at, last_checked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      )
      .run(
        userId,
        hostId,
        pane.sessionName,
        pane.sessionId,
        pane.sessionCreated,
        pane.windowIndex,
        pane.windowName,
        pane.paneIndex,
        pane.paneId,
        pane.panePid,
        pane.currentCommand,
        pane.currentCommand,
        now,
        now,
      );
    return this.getOwned(userId, Number(result.lastInsertRowid))!;
  }

  getOwned(userId: number, id: number): StoredTmuxMonitor | null {
    const row = gatewayDatabase()
      .prepare("SELECT * FROM tmux_monitors WHERE user_id = ? AND id = ?")
      .get(userId, id);
    return row ? mapMonitor(row) : null;
  }

  activeGroups(): TmuxMonitorHostGroup[] {
    const monitors = gatewayDatabase()
      .prepare("SELECT * FROM tmux_monitors WHERE status = 'active' ORDER BY user_id, host_id, id")
      .all()
      .map(mapMonitor);
    const groups = new Map<string, TmuxMonitorHostGroup>();
    for (const monitor of monitors) {
      const key = `${monitor.userId}:${monitor.hostId}`;
      const group = groups.get(key) ?? {
        userId: monitor.userId,
        hostId: monitor.hostId,
        monitors: [],
      };
      group.monitors.push(monitor);
      groups.set(key, group);
    }
    return Array.from(groups.values());
  }

  activeForHost(userId: number, hostId: number): StoredTmuxMonitor[] {
    return gatewayDatabase()
      .prepare(
        "SELECT * FROM tmux_monitors WHERE user_id = ? AND host_id = ? AND status = 'active' ORDER BY id",
      )
      .all(userId, hostId)
      .map(mapMonitor);
  }

  recordChecked(monitor: StoredTmuxMonitor, pane: TmuxPaneSnapshot) {
    const now = new Date().toISOString();
    gatewayDatabase()
      .prepare(
        `UPDATE tmux_monitors SET session_name = ?, window_index = ?, window_name = ?,
          pane_index = ?, last_command = ?, last_checked_at = ?, last_error = NULL,
          last_error_at = NULL WHERE id = ? AND status = 'active'`,
      )
      .run(
        pane.sessionName,
        pane.windowIndex,
        pane.windowName,
        pane.paneIndex,
        pane.currentCommand,
        now,
        monitor.id,
      );
  }

  recordHostError(userId: number, hostId: number, error: unknown) {
    const now = new Date().toISOString();
    gatewayDatabase()
      .prepare(
        `UPDATE tmux_monitors SET last_error = ?, last_error_at = ?
         WHERE user_id = ? AND host_id = ? AND status = 'active'`,
      )
      .run(error instanceof Error ? error.message : String(error), now, userId, hostId);
  }

  complete(
    monitor: StoredTmuxMonitor,
    reason: Exclude<TmuxMonitorCompletionReason, "cancelled">,
    pane: TmuxPaneSnapshot | null,
  ): StoredTmuxMonitor | null {
    const now = new Date().toISOString();
    const result = gatewayDatabase()
      .prepare(
        `UPDATE tmux_monitors SET status = 'completed', completion_reason = ?,
          session_name = ?, window_index = ?, window_name = ?, pane_index = ?,
          last_command = ?, last_checked_at = ?, completed_at = ?, last_error = NULL,
          last_error_at = NULL WHERE id = ? AND status = 'active'`,
      )
      .run(
        reason,
        pane?.sessionName ?? monitor.sessionName,
        pane?.windowIndex ?? monitor.windowIndex,
        pane?.windowName ?? monitor.windowName,
        pane?.paneIndex ?? monitor.paneIndex,
        pane?.currentCommand ?? monitor.lastCommand,
        now,
        now,
        monitor.id,
      );
    if (!result.changes) return null;
    this.pruneHistory(monitor.userId, monitor.hostId);
    return this.getOwned(monitor.userId, monitor.id);
  }

  cancel(userId: number, id: number): StoredTmuxMonitor | null {
    const monitor = this.getOwned(userId, id);
    if (!monitor || monitor.status !== "active") return null;
    const now = new Date().toISOString();
    gatewayDatabase()
      .prepare(
        `UPDATE tmux_monitors SET status = 'cancelled', completion_reason = 'cancelled',
          completed_at = ?, last_checked_at = ? WHERE user_id = ? AND id = ? AND status = 'active'`,
      )
      .run(now, now, userId, id);
    this.pruneHistory(userId, monitor.hostId);
    return this.getOwned(userId, id);
  }

  claimNotification(userId: number, id: number) {
    const now = new Date().toISOString();
    return Boolean(
      gatewayDatabase()
        .prepare(
          `UPDATE tmux_monitors SET notification_sent_at = ?
           WHERE user_id = ? AND id = ? AND notification_sent_at IS NULL`,
        )
        .run(now, userId, id).changes,
    );
  }

  deleteHost(userId: number, hostId: number) {
    gatewayDatabase()
      .prepare("DELETE FROM tmux_monitors WHERE user_id = ? AND host_id = ?")
      .run(userId, hostId);
  }

  private pruneHistory(userId: number, hostId: number) {
    gatewayDatabase()
      .prepare(
        `DELETE FROM tmux_monitors WHERE id IN (
          SELECT id FROM tmux_monitors
          WHERE user_id = ? AND host_id = ? AND status != 'active'
          ORDER BY completed_at DESC LIMIT -1 OFFSET ?
        )`,
      )
      .run(userId, hostId, HISTORY_LIMIT);
  }
}

function mapMonitor(row: Record<string, unknown>): StoredTmuxMonitor {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    hostId: Number(row.host_id),
    sessionName: String(row.session_name),
    sessionId: String(row.session_id),
    sessionCreated: Number(row.session_created),
    windowIndex: Number(row.window_index),
    windowName: String(row.window_name),
    paneIndex: Number(row.pane_index),
    paneId: String(row.pane_id),
    panePid: Number(row.pane_pid),
    initialCommand: String(row.initial_command),
    lastCommand: String(row.last_command),
    status: String(row.status) as TmuxMonitor["status"],
    completionReason: optionalText(row.completion_reason) as TmuxMonitorCompletionReason | null,
    createdAt: String(row.created_at),
    lastCheckedAt: optionalText(row.last_checked_at),
    completedAt: optionalText(row.completed_at),
    lastError: optionalText(row.last_error),
    lastErrorAt: optionalText(row.last_error_at),
    notificationSentAt: optionalText(row.notification_sent_at),
  };
}

function optionalText(value: unknown) {
  return typeof value === "string" && value ? value : null;
}
