import { createError } from "h3";
import type {
  TmuxMonitorListResult,
  TmuxMonitorThreadBinding,
  TmuxPaneOutput,
  TmuxSessionSnapshot,
} from "~~/shared/types";
import type { HostWithSecret } from "../infra/ssh-types";
import { TmuxMonitorNotifier } from "./monitor-notifier";
import { logicalPaneFor, PermanentTmuxMonitorChecker } from "./permanent-monitor-checker";
import { RemoteTmuxScanner } from "./remote-scanner";
import { TmuxMonitorRepository } from "./repository";
import type { StoredTmuxMonitor } from "./types";
import { resolveTmuxThreadBinding } from "./thread-binding";

export class TmuxMonitorService {
  readonly repository = new TmuxMonitorRepository();
  private readonly scanner = new RemoteTmuxScanner();
  private readonly notifier = new TmuxMonitorNotifier(this.repository);
  private readonly permanentChecker = new PermanentTmuxMonitorChecker(this.repository);

  list(userId: number): TmuxMonitorListResult {
    return this.repository.listForUser(userId);
  }

  scan(host: HostWithSecret): Promise<TmuxSessionSnapshot[]> {
    return this.scanner.scan(host);
  }

  capturePane(
    host: HostWithSecret,
    target: { sessionId: string; paneId: string },
  ): Promise<TmuxPaneOutput> {
    return this.scanner.capturePane(host, target);
  }

  async create(
    userId: number,
    host: HostWithSecret,
    target: {
      mode: "once" | "permanent";
      sessionId: string;
      paneId: string;
      thread?: TmuxMonitorThreadBinding | null;
    },
  ) {
    const sessions = await this.scanner.scan(host);
    const pane = sessions
      .find((session) => session.sessionId === target.sessionId)
      ?.panes.find((candidate) => candidate.paneId === target.paneId);
    if (!pane) {
      throw createError({
        statusCode: 409,
        statusMessage: "The selected tmux pane no longer exists",
      });
    }
    if (target.mode === "once" && !pane.running) {
      throw createError({
        statusCode: 409,
        statusMessage: "The selected tmux pane has already returned to its shell",
      });
    }
    try {
      return this.repository.create(
        userId,
        host.id,
        pane,
        resolveTmuxThreadBinding(host.id, target.thread),
        target.mode,
      );
    } catch (error) {
      if (
        /UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error))
      ) {
        throw createError({
          statusCode: 409,
          statusMessage: "This tmux pane is already monitored",
        });
      }
      throw error;
    }
  }

  cancel(userId: number, monitorId: number) {
    const monitor = this.repository.cancel(userId, monitorId);
    if (!monitor) throw createError({ statusCode: 404, statusMessage: "Active monitor not found" });
    return monitor;
  }

  async promote(userId: number, host: HostWithSecret, monitorId: number) {
    const monitor = this.repository.getOwned(userId, monitorId);
    if (!monitor || monitor.hostId !== host.id || monitor.status !== "active") {
      throw createError({ statusCode: 404, statusMessage: "Active monitor not found" });
    }
    if (monitor.mode === "permanent") return monitor;
    const sessions = await this.scanner.scan(host);
    const pane = logicalPaneFor(monitor, sessions);
    return this.repository.promote(monitor, pane ?? null);
  }

  async checkHost(userId: number, host: HostWithSecret, monitors?: StoredTmuxMonitor[]) {
    const active = monitors ?? this.repository.activeForHost(userId, host.id);
    if (!active.length) return this.list(userId);

    try {
      const sessions = await this.scanner.scan(host);
      const panes = sessions.flatMap((session) => session.panes);
      for (const monitor of active) {
        if (monitor.mode === "permanent") {
          const completed = this.permanentChecker.check(monitor, sessions);
          if (completed) this.notifier.publishCompletion(host, completed);
          continue;
        }
        const completion = completionFor(monitor, sessions, panes);
        if (!completion) {
          const pane = panes.find(
            (candidate) =>
              candidate.sessionId === monitor.sessionId && candidate.paneId === monitor.paneId,
          )!;
          this.repository.recordChecked(monitor, pane);
          continue;
        }
        const completed = this.repository.complete(monitor, completion.reason, completion.pane);
        if (completed) this.notifier.publishCompletion(host, completed);
      }
    } catch (error) {
      this.repository.recordHostError(userId, host.id, error);
      throw error;
    }
    return this.list(userId);
  }
}

function completionFor(
  monitor: StoredTmuxMonitor,
  sessions: TmuxSessionSnapshot[],
  panes: TmuxSessionSnapshot["panes"],
) {
  const session = sessions.find(
    (candidate) =>
      candidate.sessionId === monitor.sessionId &&
      candidate.sessionCreated === monitor.sessionCreated,
  );
  if (!session) return { reason: "sessionExited" as const, pane: null };
  const pane = panes.find(
    (candidate) => candidate.sessionId === monitor.sessionId && candidate.paneId === monitor.paneId,
  );
  if (!pane) return { reason: "paneExited" as const, pane: null };
  if (pane.panePid !== monitor.panePid) return { reason: "paneReplaced" as const, pane };
  if (!pane.running) return { reason: "returnedToShell" as const, pane };
  return null;
}

export const tmuxMonitorService = new TmuxMonitorService();
