import { gatewayMemoryState, toTimestamp } from "./memory";

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

  record(hostId: number, projectId: number | null, thread: any) {
    const threadId = String(thread.id);
    const timestamp = Math.floor(Date.now() / 1000);
    const metadata = {
      hostId,
      projectId,
      threadId,
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
      gatewayMemoryState.threadMetadata[index] = {
        ...gatewayMemoryState.threadMetadata[index],
        ...metadata,
        projectId: projectId ?? gatewayMemoryState.threadMetadata[index].projectId,
        cwd: metadata.cwd ?? gatewayMemoryState.threadMetadata[index].cwd,
        preview: metadata.preview ?? gatewayMemoryState.threadMetadata[index].preview,
        title: metadata.title ?? gatewayMemoryState.threadMetadata[index].title,
        name: metadata.name ?? gatewayMemoryState.threadMetadata[index].name,
        status: metadata.status ?? gatewayMemoryState.threadMetadata[index].status,
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
