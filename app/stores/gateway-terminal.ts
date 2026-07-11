import { computed, reactive, toRefs } from "vue";
import { defineStore } from "pinia";
import type { TerminalSessionSnapshot } from "~~/shared/types";
import type { TerminalSessionState } from "./gateway/types";

const MAX_TERMINAL_OUTPUT_CHUNKS = 200;
const MAX_TERMINAL_OUTPUT_CHARS = 256 * 1024;

interface GatewayTerminalState {
  terminalSessions: Record<string, TerminalSessionState>;
}

export const useGatewayTerminalStore = defineStore("gateway-terminal", () => {
  const state = reactive<GatewayTerminalState>(createTerminalState());

  const terminalSessionSnapshots = computed(() => Object.values(state.terminalSessions));

  function replaceTerminalSessions(sessions: TerminalSessionSnapshot[]) {
    const nextSessions: Record<string, TerminalSessionState> = {};
    for (const session of sessions) {
      nextSessions[session.sessionId] = normalizeTerminalSession(session);
    }
    state.terminalSessions = nextSessions;
  }

  function upsertTerminalSession(session: TerminalSessionSnapshot) {
    state.terminalSessions = {
      ...state.terminalSessions,
      [session.sessionId]: normalizeTerminalSession(session),
    };
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
  }

  function resetState() {
    Object.assign(state, createTerminalState());
  }

  return {
    ...toRefs(state),
    terminalSessionSnapshots,
    replaceTerminalSessions,
    upsertTerminalSession,
    appendTerminalOutput,
    markTerminalExited,
    removeTerminalSession,
    resetState,
  };
});

function createTerminalState(): GatewayTerminalState {
  return {
    terminalSessions: {},
  };
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
