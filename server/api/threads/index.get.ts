import { getValidatedQuery } from "h3";
import { runtimeState } from "../../utils/gateway/runtime-state";
import { threadBroker } from "../../utils/gateway/broker";
import { requireRecord, threadListSchema } from "../../utils/gateway/validation";

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, (body) => threadListSchema.parse(body));
  const host = requireRecord(runtimeState.getHostWithSecret(query.hostId), "Host not found");

  const result = await threadBroker.listThreads(host, {
    limit: query.limit,
    cursor: query.cursor || null,
    cwd: query.cwd || undefined,
    searchTerm: query.searchTerm || undefined,
    useStateDbOnly: query.useRemoteStateIndexOnly ?? true,
  });

  const threads = Array.isArray((result as any)?.data) ? (result as any).data : [];
  for (const thread of threads) {
    if (typeof thread?.cwd === "string" && thread.cwd.trim()) {
      try {
        const project = runtimeState.ensureProjectForPath(host.id, thread.cwd);
        runtimeState.recordThread(host.id, project.id, thread);
      } catch (error) {
        console.warn("[gateway] failed to index thread project", {
          hostId: host.id,
          threadId: thread?.id,
          cwd: thread.cwd,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  const mergedThreads = mergeThreads(
    threads,
    runtimeState.listThreadMetadata(host.id, {
      projectId: query.projectId ?? null,
      cwd: query.cwd ?? null,
    }),
    query.searchTerm ?? null,
  );
  return {
    ...(result as Record<string, unknown>),
    data: mergedThreads,
    projects: runtimeState.listProjects(host.id),
  };
});

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
