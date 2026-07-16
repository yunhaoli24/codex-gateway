const ACTIVE_AGENT_STATUSES = new Set(["pendingInit", "running"]);

export interface ActiveSubAgent {
  threadId: string;
  title: string;
  status: string;
}

export function activeSubAgentsFromTurns(turns: Array<Record<string, any>>): ActiveSubAgent[] {
  const agents = new Map<string, ActiveSubAgent>();
  // Activity items provide the stable thread/path identity, while collab tool
  // state is app-server's latest lifecycle snapshot. Fold both chronologically;
  // do not keep a second client-side agent registry that can outlive the thread.
  for (const turn of turns) {
    for (const item of Array.isArray(turn.items) ? turn.items : []) {
      if (item?.type === "subAgentActivity") applyActivity(agents, item);
      if (item?.type === "collabAgentToolCall") applyCollabState(agents, item);
    }
  }
  return [...agents.values()];
}

function applyActivity(agents: Map<string, ActiveSubAgent>, item: Record<string, any>) {
  const threadId = text(item.agentThreadId);
  if (!threadId) return;
  if (item.kind === "interrupted") {
    agents.delete(threadId);
    return;
  }
  const existing = agents.get(threadId);
  agents.set(threadId, {
    threadId,
    title: text(item.agentPath) || existing?.title || `agent-${threadId.slice(0, 8)}`,
    status: existing?.status || "running",
  });
}

function applyCollabState(agents: Map<string, ActiveSubAgent>, item: Record<string, any>) {
  const receiverIds = Array.isArray(item.receiverThreadIds)
    ? item.receiverThreadIds.map(String)
    : [];
  const states =
    item.agentsStates && typeof item.agentsStates === "object" ? item.agentsStates : {};
  for (const threadId of new Set([...receiverIds, ...Object.keys(states)])) {
    const status = text(states[threadId]?.status);
    if (status && !ACTIVE_AGENT_STATUSES.has(status)) {
      agents.delete(threadId);
      continue;
    }
    if (!status && item.tool !== "spawnAgent") continue;
    const existing = agents.get(threadId);
    agents.set(threadId, {
      threadId,
      title: existing?.title || `agent-${threadId.slice(0, 8)}`,
      status: status || "pendingInit",
    });
  }
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}
