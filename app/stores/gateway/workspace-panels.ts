export const AGENT_WORKSPACE_PANEL_ID = "agent";
export const FILES_WORKSPACE_PANEL_ID = "files";

export function terminalWorkspacePanelId(sessionId: string) {
  return `terminal:${sessionId}`;
}

export function subAgentWorkspacePanelId(key: string) {
  return `subagent:${key}`;
}
