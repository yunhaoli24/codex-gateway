import { getValidatedQuery } from "h3";
import { threadBroker } from "../../utils/gateway/runtime/broker";
import {
  defineGatewayEventHandler,
  hostLogContext,
  setGatewayRequestLogContext,
} from "../../utils/gateway/http/errors";
import { requireRecord } from "../../utils/gateway/http/validation/common";
import { threadListSchema } from "../../utils/gateway/http/validation/threads";
import { hostStore } from "../../utils/gateway/state/hosts";
import { projectStore } from "../../utils/gateway/state/projects";
import { threadMetadataStore } from "../../utils/gateway/state/thread-metadata";
import { threadSnapshotStore } from "../../utils/gateway/state/thread-snapshots";
import { withAllThreadSources } from "../../utils/gateway/protocol/thread-list";
import { threadProjectDiscovery } from "../../utils/gateway/runtime/thread-project-discovery";
import type { AppServerThread, GatewayThread } from "~~/shared/types";
import { trimmedOrNull } from "~~/shared/utils/strings";
import { isWorkspacePath } from "../../utils/gateway/state/workspace-scope";
import { gatewayThreadFromAppServer } from "../../utils/gateway/protocol/gateway-thread";

export default defineGatewayEventHandler(async (event) => {
  const query = await getValidatedQuery(event, (body) => threadListSchema.parse(body));
  const host = requireRecord(hostStore.getWithSecret(query.hostId), "Host not found");
  const userId = event.context.auth?.user.id;
  const discoveryGeneration =
    userId === undefined ? null : threadProjectDiscovery.captureGeneration(userId, host.id);
  setGatewayRequestLogContext(event, "threads/list", {
    ...hostLogContext(host),
    cwd: query.cwd ?? null,
    limit: query.limit,
    cursor: query.cursor ?? null,
    searchTerm: query.searchTerm ?? null,
    useRemoteStateIndexOnly: query.useRemoteStateIndexOnly ?? false,
  });

  const listParams = withAllThreadSources({
    limit: query.limit,
    cursor: trimmedOrNull(query.cursor),
    cwd: trimmedOrNull(query.cwd) ?? undefined,
    searchTerm: trimmedOrNull(query.searchTerm) ?? undefined,
    useStateDbOnly: query.useRemoteStateIndexOnly ?? false,
  });
  const page = await threadBroker.listThreads(host, listParams);
  if (userId !== undefined && discoveryGeneration !== null) {
    const current = threadProjectDiscovery.indexPageIfCurrent(
      userId,
      host.id,
      discoveryGeneration,
      page,
    );
    if (current && shouldDiscoverHostProjects(query)) {
      threadProjectDiscovery.schedule(userId, host, page, listParams, discoveryGeneration);
    }
  }
  const projects = projectStore.list(host.id);
  const indexedThreads = threadMetadataStore.list(host.id, {
    cwd: query.cwd ?? null,
  });
  const gatewayThreads = gatewayThreadsForList(
    host.id,
    page.data,
    threadSnapshotStore.listForHost(host.id).map((record) => record.snapshot.thread),
    indexedThreads,
    query.searchTerm ?? null,
  );
  // Directory groups describe Codex conversations, including history from a removed cwd.
  // Listing them needs no SFTP existence check; actual file operations report their own errors.
  return {
    ...page,
    data: gatewayThreads.filter((thread) => isWorkspacePath(host.id, thread.cwd)),
    projects,
  };
});

function shouldDiscoverHostProjects(query: {
  cwd?: string | null;
  searchTerm?: string | null;
  cursor?: string | null;
}) {
  return (
    trimmedOrNull(query.cwd) === null &&
    trimmedOrNull(query.searchTerm) === null &&
    trimmedOrNull(query.cursor) === null
  );
}

function gatewayThreadsForList(
  hostId: number,
  remoteThreads: AppServerThread[],
  cachedThreads: AppServerThread[],
  indexedThreads: ReturnType<typeof threadMetadataStore.list>,
  searchTerm: string | null,
) {
  const metadataById = new Map(indexedThreads.map((thread) => [thread.id, thread]));
  const threadsById = new Map(remoteThreads.map((thread) => [thread.id, thread]));
  for (const thread of cachedThreads) {
    if (metadataById.has(thread.id) && !threadsById.has(thread.id)) {
      // A freshly started thread can precede rollout materialization and therefore be absent from
      // thread/list briefly. The open snapshot is the complete official DTO returned by
      // thread/start; never synthesize an AppServerThread from the metadata index.
      threadsById.set(thread.id, thread);
    }
  }
  const normalizedSearch = searchTerm?.trim().toLowerCase() ?? "";
  return [...threadsById.values()]
    .map((thread) => {
      return gatewayThreadFromAppServer(hostId, thread);
    })
    .filter((thread) => {
      if (!normalizedSearch) {
        return true;
      }
      return [thread.id, thread.title, thread.name, thread.preview, thread.cwd]
        .filter((value): value is string => typeof value === "string")
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    })
    .sort(
      (left, right) =>
        Number(right.recencyAt ?? right.updatedAt ?? 0) -
        Number(left.recencyAt ?? left.updatedAt ?? 0),
    ) satisfies GatewayThread[];
}
