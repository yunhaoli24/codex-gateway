import { randomUUID } from "node:crypto";
import type { ClientChannel } from "ssh2";
import type {
  HostRecord,
  TerminalOpenTarget,
  TerminalSessionSnapshot,
  TerminalScope,
} from "~~/shared/types";
import { shellQuote } from "../infra/shell";
import { sshConnections } from "../infra/host-services";
import { terminalEventBus } from "./events";

const MAX_OUTPUT_BUFFER_BYTES = 256 * 1024;

interface TerminalSession {
  sessionId: string;
  userId: number;
  hostId: number;
  projectId: number | null;
  threadId: string | null;
  cwd: string | null;
  title: string;
  scope: TerminalScope;
  cols: number;
  rows: number;
  createdAt: string;
  lastActiveAt: string;
  status: "open" | "closed";
  output: string;
  seq: number;
  channel: ClientChannel;
}

export class TerminalManager {
  private sessions = new Map<string, TerminalSession>();

  async open(userId: number, host: HostRecord, target: TerminalOpenTarget) {
    const sessionId = randomUUID();
    const now = new Date().toISOString();
    const channel = await sshConnections.openShell(host, {
      term: "xterm-256color",
      cols: normalizeDimension(target.cols, 80),
      rows: normalizeDimension(target.rows, 24),
    });
    const session: TerminalSession = {
      sessionId,
      userId,
      hostId: host.id,
      projectId: target.projectId ?? null,
      threadId: target.threadId?.trim() || null,
      cwd: target.cwd?.trim() || null,
      title: target.title?.trim() || titleForScope(target.scope, host),
      scope: target.scope,
      cols: normalizeDimension(target.cols, 80),
      rows: normalizeDimension(target.rows, 24),
      createdAt: now,
      lastActiveAt: now,
      status: "open",
      output: "",
      seq: 0,
      channel,
    };
    this.sessions.set(sessionId, session);
    this.bindChannel(session);
    this.enterWorkingDirectory(session);
    return this.snapshot(session);
  }

  list(userId: number) {
    return [...this.sessions.values()]
      .filter((session) => session.userId === userId && session.status === "open")
      .map((session) => this.snapshot(session));
  }

  input(userId: number, sessionId: string, data: string) {
    const session = this.requireSession(userId, sessionId);
    session.lastActiveAt = new Date().toISOString();
    session.channel.write(data);
  }

  resize(userId: number, sessionId: string, cols: number, rows: number) {
    const session = this.requireSession(userId, sessionId);
    session.cols = normalizeDimension(cols, session.cols);
    session.rows = normalizeDimension(rows, session.rows);
    session.lastActiveAt = new Date().toISOString();
    session.channel.setWindow(session.rows, session.cols, 0, 0);
  }

  close(userId: number, sessionId: string) {
    const session = this.requireSession(userId, sessionId);
    this.closeSession(session);
  }

  closeHost(hostId: number) {
    for (const session of this.sessions.values()) {
      if (session.hostId === hostId) {
        this.closeSession(session);
      }
    }
  }

  private bindChannel(session: TerminalSession) {
    session.channel.on("data", (chunk: Buffer) => {
      const data = chunk.toString("utf8");
      session.output = trimOutput(session.output + data);
      session.seq += 1;
      session.lastActiveAt = new Date().toISOString();
      terminalEventBus.publish(session.userId, {
        type: "terminal.output",
        sessionId: session.sessionId,
        data,
        seq: session.seq,
        createdAt: session.lastActiveAt,
      });
    });
    session.channel.stderr.on("data", (chunk: Buffer) => {
      const data = chunk.toString("utf8");
      session.output = trimOutput(session.output + data);
      session.seq += 1;
      session.lastActiveAt = new Date().toISOString();
      terminalEventBus.publish(session.userId, {
        type: "terminal.output",
        sessionId: session.sessionId,
        data,
        seq: session.seq,
        createdAt: session.lastActiveAt,
      });
    });
    session.channel.on("error", (error: Error) => {
      terminalEventBus.publish(session.userId, {
        type: "terminal.error",
        sessionId: session.sessionId,
        message: error.message,
      });
    });
    session.channel.on("close", (code: number | null, signal: string | null) => {
      if (session.status === "closed") {
        return;
      }
      session.status = "closed";
      this.sessions.delete(session.sessionId);
      terminalEventBus.publish(session.userId, {
        type: "terminal.exited",
        sessionId: session.sessionId,
        code,
        signal,
        createdAt: new Date().toISOString(),
      });
    });
  }

  private enterWorkingDirectory(session: TerminalSession) {
    if (!session.cwd) {
      return;
    }
    session.channel.write(`cd -- ${shellQuote(session.cwd)}\n`);
  }

  private requireSession(userId: number, sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId || session.status !== "open") {
      throw new Error("Terminal session not found");
    }
    return session;
  }

  private closeSession(session: TerminalSession) {
    if (session.status === "closed") {
      return;
    }
    session.status = "closed";
    this.sessions.delete(session.sessionId);
    session.channel.close();
    terminalEventBus.publish(session.userId, {
      type: "terminal.closed.event",
      sessionId: session.sessionId,
    });
  }

  private snapshot(session: TerminalSession): TerminalSessionSnapshot {
    return {
      sessionId: session.sessionId,
      hostId: session.hostId,
      projectId: session.projectId,
      threadId: session.threadId,
      cwd: session.cwd,
      title: session.title,
      scope: session.scope,
      cols: session.cols,
      rows: session.rows,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
      status: session.status,
      output: session.output,
    };
  }
}

export const terminalManager = new TerminalManager();

function normalizeDimension(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(2, Math.floor(value));
}

function trimOutput(output: string) {
  if (Buffer.byteLength(output, "utf8") <= MAX_OUTPUT_BUFFER_BYTES) {
    return output;
  }
  return output.slice(-MAX_OUTPUT_BUFFER_BYTES);
}

function titleForScope(scope: TerminalScope, host: HostRecord) {
  if (scope === "host") {
    return host.name;
  }
  return `${host.name} terminal`;
}
