export const AGENT_WORKSPACE_TAB_ID = "agent";

export function terminalWorkspaceTabId(sessionId: string) {
  return `terminal:${sessionId}`;
}

export function subAgentWorkspaceTabId(key: string) {
  return `subagent:${key}`;
}

export function fileWorkspaceTabId(key: string) {
  return `file:${key}`;
}

export function terminalSessionIdFromTabId(tabId: string) {
  return tabId.startsWith("terminal:") ? tabId.slice("terminal:".length) : null;
}
