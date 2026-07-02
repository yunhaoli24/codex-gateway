import { gatewayMemoryState, nowIso } from "./memory";

export const subAgentThreadStore = {
  pruneToHosts(hostIds: Set<number>) {
    gatewayMemoryState.subAgentThreads = gatewayMemoryState.subAgentThreads.filter((thread) =>
      hostIds.has(thread.hostId),
    );
  },

  deleteForHost(hostId: number) {
    gatewayMemoryState.subAgentThreads = gatewayMemoryState.subAgentThreads.filter(
      (thread) => thread.hostId !== hostId,
    );
  },

  record(hostId: number, threadId: string, parentThreadId: string | null = null) {
    const normalizedThreadId = threadId.trim();
    if (!normalizedThreadId) {
      return;
    }
    const updatedAt = nowIso();
    const index = gatewayMemoryState.subAgentThreads.findIndex(
      (thread) => thread.hostId === hostId && thread.threadId === normalizedThreadId,
    );
    if (index >= 0) {
      const existing = gatewayMemoryState.subAgentThreads[index];
      if (!existing) {
        return;
      }
      gatewayMemoryState.subAgentThreads[index] = {
        ...existing,
        parentThreadId: parentThreadId ?? existing.parentThreadId,
        updatedAt,
      };
      return;
    }
    gatewayMemoryState.subAgentThreads.push({
      hostId,
      threadId: normalizedThreadId,
      parentThreadId,
      updatedAt,
    });
  },

  recordThreadMetadata(hostId: number, thread: any) {
    if (!isSubAgentThreadMetadata(thread)) {
      return;
    }
    this.record(hostId, String(thread.id), parentThreadIdFromMetadata(thread));
  },

  recordRuntimeEvent(hostId: number, parentThreadId: string, method: string, payload: unknown) {
    for (const threadId of subAgentThreadIdsFromRuntimeEvent(method, payload)) {
      this.record(hostId, threadId, parentThreadId);
    }
  },

  isSubAgentThread(hostId: number, threadId: string) {
    return gatewayMemoryState.subAgentThreads.some(
      (thread) => thread.hostId === hostId && thread.threadId === threadId,
    );
  },
};

function isSubAgentThreadMetadata(thread: any) {
  return typeof thread?.id === "string" && parentThreadIdFromMetadata(thread) !== null;
}

function parentThreadIdFromMetadata(thread: any) {
  const parentThreadId = thread?.parentThreadId ?? thread?.parent_thread_id;
  return typeof parentThreadId === "string" && parentThreadId.trim() ? parentThreadId.trim() : null;
}

function subAgentThreadIdsFromRuntimeEvent(method: string, payload: unknown) {
  if (method !== "item/started" && method !== "item/completed") {
    return [];
  }
  const item = (payload as any)?.params?.item;
  if (!item || typeof item !== "object") {
    return [];
  }
  return subAgentThreadIdsFromItem(item);
}

function subAgentThreadIdsFromItem(item: any) {
  if (item.type !== "subAgentActivity") {
    return [];
  }
  return typeof item.agentThreadId === "string" && item.agentThreadId.trim()
    ? [item.agentThreadId.trim()]
    : [];
}
