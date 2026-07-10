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
import { withAllThreadSources } from "../../utils/gateway/protocol/thread-list";

export default defineGatewayEventHandler(async (event) => {
  const query = await getValidatedQuery(event, (body) => threadListSchema.parse(body));
  const host = requireRecord(hostStore.getWithSecret(query.hostId), "Host not found");
  setGatewayRequestLogContext(event, "threads/list", {
    ...hostLogContext(host),
    projectId: query.projectId ?? null,
    cwd: query.cwd ?? null,
    limit: query.limit,
    cursor: query.cursor ?? null,
    searchTerm: query.searchTerm ?? null,
    useRemoteStateIndexOnly: query.useRemoteStateIndexOnly ?? false,
  });

  const listParams = withAllThreadSources({
    limit: query.limit,
    cursor: query.cursor || null,
    cwd: query.cwd || undefined,
    searchTerm: query.searchTerm || undefined,
    useStateDbOnly: query.useRemoteStateIndexOnly ?? false,
  });
  const result = await threadBroker.listThreads(host, listParams);

  const threads = Array.isArray((result as any)?.data) ? (result as any).data : [];
  indexThreadProjects(host.id, threads);

  if (shouldDiscoverHostProjects(query)) {
    await discoverHostProjects(host, result, listParams);
  }
  const mergedThreads = mergeThreads(
    threads,
    threadMetadataStore.list(host.id, {
      projectId: query.projectId ?? null,
      cwd: query.cwd ?? null,
    }),
    query.searchTerm ?? null,
  );
  return {
    ...(result as Record<string, unknown>),
    data: mergedThreads,
    projects: projectStore.list(host.id),
  };
});

function shouldDiscoverHostProjects(query: {
  projectId?: number | null;
  cwd?: string | null;
  searchTerm?: string | null;
  cursor?: string | null;
}) {
  return !query.projectId && !query.cwd && !query.searchTerm && !query.cursor;
}

async function discoverHostProjects(
  host: any,
  firstPage: unknown,
  firstParams: Record<string, unknown>,
) {
  let cursor =
    typeof (firstPage as any)?.nextCursor === "string" ? (firstPage as any).nextCursor : null;
  const seenCursors = new Set<string>();

  while (cursor && !seenCursors.has(cursor)) {
    seenCursors.add(cursor);
    const page = await threadBroker.listThreads(host, {
      ...firstParams,
      cursor,
      useStateDbOnly: false,
    });
    const threads = Array.isArray((page as any)?.data) ? (page as any).data : [];
    indexThreadProjects(host.id, threads);
    cursor = typeof (page as any)?.nextCursor === "string" ? (page as any).nextCursor : null;
  }
}

function indexThreadProjects(hostId: number, threads: any[]) {
  for (const thread of threads) {
    if (typeof thread?.cwd !== "string" || !thread.cwd.trim()) {
      continue;
    }
    try {
      const project = projectStore.ensureForPath(hostId, thread.cwd);
      threadMetadataStore.record(hostId, project.id, thread);
    } catch (error) {
      console.warn("[gateway] failed to index thread project", {
        hostId,
        threadId: thread?.id,
        cwd: thread.cwd,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function mergeThreads(remoteThreads: any[], indexedThreads: any[], searchTerm: string | null) {
  const byId = new Map<string, any>();
  for (const thread of indexedThreads) {
    byId.set(String(thread.id), thread);
  }
  for (const thread of remoteThreads) {
    const id = String(thread.id);
    byId.set(id, {
      ...byId.get(id),
      ...thread,
    });
  }

  const normalizedSearch = searchTerm?.trim().toLowerCase() ?? "";
  return Array.from(byId.values())
    .filter((thread) => {
      if (!normalizedSearch) {
        return true;
      }
      return [thread.id, thread.title, thread.name, thread.preview, thread.cwd]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    })
    .sort(
      (left, right) =>
        Number(right.recencyAt || right.updatedAt || 0) -
        Number(left.recencyAt || left.updatedAt || 0),
    );
}
