import { gatewayMemoryState, toTimestamp } from "./memory";
import { parentThreadIdFromMetadata, subAgentThreadStore } from "./sub-agent-threads";

export const threadMetadataStore = {
  pruneToHosts(hostIds: Set<number>) {
    gatewayMemoryState.threadMetadata = gatewayMemoryState.threadMetadata.filter((thread) =>
      hostIds.has(thread.hostId),
    );
  },

  deleteForHost(hostId: number) {
    gatewayMemoryState.threadMetadata = gatewayMemoryState.threadMetadata.filter(
      (thread) => thread.hostId !== hostId,
    );
  },

  get(hostId: number, threadId: string) {
    return (
      gatewayMemoryState.threadMetadata.find(
        (thread) => thread.hostId === hostId && thread.threadId === threadId,
      ) ?? null
    );
  },

  record(hostId: number, projectId: number | null, thread: any) {
    const threadId = String(thread.id);
    subAgentThreadStore.recordThreadMetadata(hostId, thread);
    const timestamp = Math.floor(Date.now() / 1000);
    const metadata = {
      hostId,
      projectId,
      threadId,
      parentThreadId: parentThreadIdFromMetadata(thread),
      title: thread.title ?? thread.name ?? null,
      name: thread.name ?? null,
      preview: thread.preview ?? thread.name ?? null,
      cwd: thread.cwd ?? null,
      status: thread.status ?? null,
      recencyAt: toTimestamp(thread.recencyAt ?? thread.updatedAt ?? thread.createdAt) ?? timestamp,
      updatedAt: toTimestamp(thread.updatedAt ?? thread.recencyAt ?? thread.createdAt) ?? timestamp,
    };
    const index = gatewayMemoryState.threadMetadata.findIndex(
      (item) => item.hostId === hostId && item.threadId === threadId,
    );
    if (index >= 0) {
      const existing = gatewayMemoryState.threadMetadata[index];
      if (!existing) {
        return;
      }
      gatewayMemoryState.threadMetadata[index] = {
        ...existing,
        ...metadata,
        projectId: projectId ?? existing.projectId,
        parentThreadId: metadata.parentThreadId ?? existing.parentThreadId,
        cwd: metadata.cwd ?? existing.cwd,
        preview: metadata.preview ?? existing.preview,
        title: metadata.title ?? existing.title,
        name: metadata.name ?? existing.name,
        status: metadata.status ?? existing.status,
      };
    } else {
      gatewayMemoryState.threadMetadata.push(metadata);
    }
  },

  list(hostId: number, options: { projectId?: number | null; cwd?: string | null } = {}) {
    return gatewayMemoryState.threadMetadata
      .filter((thread) => {
        if (thread.hostId !== hostId) {
          return false;
        }
        if (options.projectId != null && thread.projectId !== options.projectId) {
          return false;
        }
        if (options.cwd && thread.cwd && thread.cwd !== options.cwd) {
          return false;
        }
        return true;
      })
      .map((thread) => ({
        id: thread.threadId,
        projectId: thread.projectId,
        parentThreadId: thread.parentThreadId,
        title: thread.title,
        name: thread.name,
        preview: thread.preview,
        cwd: thread.cwd,
        status: thread.status,
        recencyAt: thread.recencyAt,
        updatedAt: thread.updatedAt,
      }))
      .sort(
        (left, right) =>
          Number(right.recencyAt || right.updatedAt || 0) -
          Number(left.recencyAt || left.updatedAt || 0),
      );
  },
};
