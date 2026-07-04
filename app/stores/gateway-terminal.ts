import { computed, reactive, toRefs } from "vue";
import { defineStore } from "pinia";
import type { TerminalSessionSnapshot } from "~~/shared/types";
import type { TerminalSessionState, WorkspaceTabState } from "./gateway/types";

const AGENT_TAB_ID = "agent";
const MAX_TERMINAL_OUTPUT_CHUNKS = 200;
const MAX_TERMINAL_OUTPUT_CHARS = 256 * 1024;

interface GatewayTerminalState {
  workspaceTabs: WorkspaceTabState[];
  activeWorkspaceTabId: string;
  terminalSessions: Record<string, TerminalSessionState>;
}

export const useGatewayTerminalStore = defineStore("gateway-terminal", () => {
  const { t } = useI18n();
  const state = reactive<GatewayTerminalState>({
    workspaceTabs: [agentTab(t)],
    activeWorkspaceTabId: AGENT_TAB_ID,
    terminalSessions: {},
  });

  const activeWorkspaceTab = computed(
    () =>
      state.workspaceTabs.find((tab) => tab.id === state.activeWorkspaceTabId) ??
      state.workspaceTabs[0],
  );
  const terminalSessionSnapshots = computed(() => Object.values(state.terminalSessions));

  function setActiveWorkspaceTab(tabId: string) {
    state.activeWorkspaceTabId = tabId;
  }

  function activateAgentTab() {
    state.activeWorkspaceTabId = AGENT_TAB_ID;
  }

  function activateTerminalTab(sessionId: string) {
    ensureTerminalTab(sessionId);
    state.activeWorkspaceTabId = terminalTabId(sessionId);
  }

  function replaceTerminalSessions(sessions: TerminalSessionSnapshot[]) {
    const nextSessions: Record<string, TerminalSessionState> = {};
    for (const session of sessions) {
      nextSessions[session.sessionId] = normalizeTerminalSession(session);
    }
    state.terminalSessions = nextSessions;
    state.workspaceTabs = [agentTab(t), ...sessions.map((session) => tabFromSession(session))];
    if (!state.workspaceTabs.some((tab) => tab.id === state.activeWorkspaceTabId)) {
      state.activeWorkspaceTabId = AGENT_TAB_ID;
    }
  }

  function upsertTerminalSession(session: TerminalSessionSnapshot) {
    state.terminalSessions = {
      ...state.terminalSessions,
      [session.sessionId]: normalizeTerminalSession(session),
    };
    ensureTerminalTab(session.sessionId);
  }

  function appendTerminalOutput(sessionId: string, data: string) {
    const session = state.terminalSessions[sessionId];
    if (!session) {
      return;
    }
    state.terminalSessions = {
      ...state.terminalSessions,
      [sessionId]: {
        ...session,
        ...appendOutputChunk(session, data),
        lastActiveAt: new Date().toISOString(),
      },
    };
  }

  function markTerminalExited(sessionId: string, message: string) {
    const session = state.terminalSessions[sessionId];
    if (!session) {
      return;
    }
    state.terminalSessions = {
      ...state.terminalSessions,
      [sessionId]: {
        ...session,
        status: "closed",
        ...appendOutputChunk(session, `\r\n${message}\r\n`),
        lastActiveAt: new Date().toISOString(),
      },
    };
  }

  function removeTerminalSession(sessionId: string) {
    const { [sessionId]: _removed, ...terminalSessions } = state.terminalSessions;
    state.terminalSessions = terminalSessions;
    const tabId = terminalTabId(sessionId);
    state.workspaceTabs = state.workspaceTabs.filter((tab) => tab.id !== tabId);
    if (state.activeWorkspaceTabId === tabId) {
      state.activeWorkspaceTabId = AGENT_TAB_ID;
    }
  }

  function ensureTerminalTab(sessionId: string) {
    const session = state.terminalSessions[sessionId];
    if (!session) {
      return;
    }
    const tab = tabFromSession(session);
    const exists = state.workspaceTabs.some((candidate) => candidate.id === tab.id);
    state.workspaceTabs = exists
      ? state.workspaceTabs.map((candidate) => (candidate.id === tab.id ? tab : candidate))
      : [...state.workspaceTabs, tab];
  }

  return {
    ...toRefs(state),
    activeWorkspaceTab,
    terminalSessionSnapshots,
    setActiveWorkspaceTab,
    activateAgentTab,
    activateTerminalTab,
    replaceTerminalSessions,
    upsertTerminalSession,
    appendTerminalOutput,
    markTerminalExited,
    removeTerminalSession,
  };
});

function agentTab(t: (key: string) => string) {
  return {
    id: AGENT_TAB_ID,
    kind: "agent" as const,
    title: t("app.agentTab"),
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

function normalizeTerminalSession(session: TerminalSessionSnapshot): TerminalSessionState {
  const chunks = session.output ? [session.output] : [];
  return {
    ...session,
    ...boundedOutput(chunks),
  };
}

function appendOutputChunk(session: TerminalSessionState, data: string) {
  return boundedOutput([...session.outputChunks, data]);
}

function boundedOutput(chunks: string[]) {
  let nextChunks = chunks.slice(-MAX_TERMINAL_OUTPUT_CHUNKS);
  let output = nextChunks.join("");
  while (output.length > MAX_TERMINAL_OUTPUT_CHARS && nextChunks.length > 1) {
    nextChunks = nextChunks.slice(1);
    output = nextChunks.join("");
  }
  if (output.length > MAX_TERMINAL_OUTPUT_CHARS) {
    output = output.slice(-MAX_TERMINAL_OUTPUT_CHARS);
    nextChunks = [output];
  }
  return {
    output,
    outputChunks: nextChunks,
  };
}
