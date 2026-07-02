import type { TerminalSessionSnapshot } from "~~/shared/types";
import { sendRealtimeRequest } from "../realtime/request-response";
import type { GatewayStoreContext, TerminalOpenInput } from "../types";
import { messageFromError } from "../thread-utils/identity";

const AGENT_TAB_ID = "agent";

export function createTerminalActions(ctx: GatewayStoreContext) {
  return {
    async restoreTerminalSessions() {
      try {
        const response = await sendRealtimeRequest<{ sessions: TerminalSessionSnapshot[] }>(
          ctx,
          (requestId) => ({ type: "terminal.list", requestId }),
        );
        ctx.replaceTerminalSessions(response.sessions ?? []);
      } catch {
        // Realtime reconnect may race with app hydration. The next ready event will retry.
      }
    },

    async openTerminal(input: TerminalOpenInput) {
      try {
        const response = await sendRealtimeRequest<{ session: TerminalSessionSnapshot }>(
          ctx,
          (requestId) => ({
            type: "terminal.open",
            requestId,
            ...input,
            cols: input.cols ?? 80,
            rows: input.rows ?? 24,
          }),
          30_000,
        );
        ctx.upsertTerminalSession(response.session);
        ctx.activateTerminalTab(response.session.sessionId);
        return response.session;
      } catch (error: any) {
        ctx.setError(messageFromError(error, ctx.t("app.openTerminalFailed"), ctx.errorLabels), {
          hostId: input.hostId,
          projectId: input.projectId ?? null,
          threadId: input.threadId ?? null,
        });
        throw error;
      }
    },

    sendTerminalInput(sessionId: string, data: string) {
      ctx.sendRealtime({ type: "terminal.input", sessionId, data });
    },

    resizeTerminal(sessionId: string, cols: number, rows: number) {
      ctx.sendRealtime({ type: "terminal.resize", sessionId, cols, rows });
    },

    async closeTerminal(sessionId: string) {
      ctx.removeTerminalSession(sessionId);
      await sendRealtimeRequest(ctx, (requestId) => ({
        type: "terminal.close",
        requestId,
        sessionId,
      })).catch(() => null);
    },

    setActiveWorkspaceTab(tabId: string) {
      ctx.state.activeWorkspaceTabId = tabId;
    },

    activateAgentTab() {
      ctx.state.activeWorkspaceTabId = AGENT_TAB_ID;
    },

    activateTerminalTab(sessionId: string) {
      ensureTerminalTab(ctx, sessionId);
      ctx.state.activeWorkspaceTabId = terminalTabId(sessionId);
    },

    replaceTerminalSessions(sessions: TerminalSessionSnapshot[]) {
      const nextSessions: Record<string, TerminalSessionSnapshot> = {};
      for (const session of sessions) {
        nextSessions[session.sessionId] = session;
      }
      ctx.state.terminalSessions = nextSessions;
      ctx.state.workspaceTabs = [
        agentTab(ctx),
        ...sessions.map((session) => tabFromSession(session)),
      ];
      if (!ctx.state.workspaceTabs.some((tab) => tab.id === ctx.state.activeWorkspaceTabId)) {
        ctx.state.activeWorkspaceTabId = AGENT_TAB_ID;
      }
    },

    upsertTerminalSession(session: TerminalSessionSnapshot) {
      ctx.state.terminalSessions = {
        ...ctx.state.terminalSessions,
        [session.sessionId]: session,
      };
      ensureTerminalTab(ctx, session.sessionId);
    },

    appendTerminalOutput(sessionId: string, data: string) {
      const session = ctx.state.terminalSessions[sessionId];
      if (!session) {
        return;
      }
      ctx.state.terminalSessions = {
        ...ctx.state.terminalSessions,
        [sessionId]: {
          ...session,
          output: session.output + data,
          lastActiveAt: new Date().toISOString(),
        },
      };
    },

    markTerminalExited(sessionId: string, message: string) {
      const session = ctx.state.terminalSessions[sessionId];
      if (!session) {
        return;
      }
      ctx.state.terminalSessions = {
        ...ctx.state.terminalSessions,
        [sessionId]: {
          ...session,
          status: "closed",
          output: `${session.output}\r\n${message}\r\n`,
          lastActiveAt: new Date().toISOString(),
        },
      };
    },

    removeTerminalSession(sessionId: string) {
      const { [sessionId]: _removed, ...terminalSessions } = ctx.state.terminalSessions;
      ctx.state.terminalSessions = terminalSessions;
      const tabId = terminalTabId(sessionId);
      ctx.state.workspaceTabs = ctx.state.workspaceTabs.filter((tab) => tab.id !== tabId);
      if (ctx.state.activeWorkspaceTabId === tabId) {
        ctx.state.activeWorkspaceTabId = AGENT_TAB_ID;
      }
    },
  };
}

function ensureTerminalTab(ctx: GatewayStoreContext, sessionId: string) {
  const session = ctx.state.terminalSessions[sessionId];
  if (!session) {
    return;
  }
  const tab = tabFromSession(session);
  const exists = ctx.state.workspaceTabs.some((candidate) => candidate.id === tab.id);
  ctx.state.workspaceTabs = exists
    ? ctx.state.workspaceTabs.map((candidate) => (candidate.id === tab.id ? tab : candidate))
    : [...ctx.state.workspaceTabs, tab];
}

function agentTab(ctx: GatewayStoreContext) {
  return {
    id: AGENT_TAB_ID,
    kind: "agent" as const,
    title: ctx.t("app.agentTab"),
  };
}

function tabFromSession(session: TerminalSessionSnapshot) {
  return {
    id: terminalTabId(session.sessionId),
    kind: "terminal" as const,
    title: session.title,
    sessionId: session.sessionId,
  };
}

function terminalTabId(sessionId: string) {
  return `terminal:${sessionId}`;
}
