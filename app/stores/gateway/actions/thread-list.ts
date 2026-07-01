import type { GatewayStoreContext, ThreadListResponse } from "../types";
import { gatewayApi } from "@/utils/gateway-api";
import { messageFromError, pinnedKey, sortThreads } from "../thread-utils/identity";
import { runtimeStatusFromAppThreadStatus } from "../thread-utils/status";

export function createThreadListActions(ctx: GatewayStoreContext) {
  return {
    async connectAllHosts() {
      const hosts = [...ctx.state.hosts];
      if (!hosts.length) {
        return;
      }

      await Promise.all(
        hosts.map(async (host) => {
          ctx.state.hostConnectionStatuses = {
            ...ctx.state.hostConnectionStatuses,
            [host.id]: { status: "connecting", updatedAt: Date.now() },
          };
          try {
            const response = await gatewayApi<ThreadListResponse>("/api/threads", {
              query: {
                hostId: host.id,
                limit: 50,
              },
            });
            if (response.projects) {
              ctx.mergeProjects(response.projects);
            }
            syncThreadStatusesFromList(ctx, host.id, response.data ?? []);
            ctx.state.hostConnectionStatuses = {
              ...ctx.state.hostConnectionStatuses,
              [host.id]: { status: "connected", updatedAt: Date.now() },
            };
          } catch (error: any) {
            ctx.state.hostConnectionStatuses = {
              ...ctx.state.hostConnectionStatuses,
              [host.id]: {
                status: "failed",
                message: messageFromError(error, ctx.t("app.connectHostFailed"), ctx.errorLabels),
                updatedAt: Date.now(),
              },
            };
          }
        }),
      );
      ctx.persistConfig();
    },

    async listThreads(searchTerm = "") {
      const hostId = ctx.state.selectedHostId;
      const projectId = ctx.state.selectedProjectId;
      const projectCwd = ctx.selectedProject?.remotePath;
      if (!hostId) {
        return;
      }

      ctx.state.loading = true;
      ctx.clearError();
      try {
        const query: Record<string, unknown> = {
          hostId,
          limit: 50,
        };
        if (projectId) {
          query.projectId = projectId;
        }
        if (projectCwd) {
          query.cwd = projectCwd;
        }
        if (searchTerm) {
          query.searchTerm = searchTerm;
        }
        const response = await gatewayApi<ThreadListResponse>("/api/threads", { query });
        if (ctx.state.selectedHostId !== hostId || ctx.state.selectedProjectId !== projectId) {
          return;
        }
        if (response.projects) {
          ctx.mergeProjects(response.projects);
        }
        ctx.state.hostConnectionStatuses = {
          ...ctx.state.hostConnectionStatuses,
          [hostId]: { status: "connected", updatedAt: Date.now() },
        };
        syncThreadStatusesFromList(ctx, hostId, response.data ?? []);
        ctx.state.threads = sortThreads(ctx.decorateThreads(response.data ?? []));
        ctx.persistConfig();
      } catch (error: any) {
        if (ctx.state.selectedHostId !== hostId || ctx.state.selectedProjectId !== projectId) {
          return;
        }
        ctx.state.hostConnectionStatuses = {
          ...ctx.state.hostConnectionStatuses,
          [hostId]: {
            status: "failed",
            message: messageFromError(error, ctx.t("app.listThreadsFailed"), ctx.errorLabels),
            updatedAt: Date.now(),
          },
        };
        ctx.setError(messageFromError(error, ctx.t("app.listThreadsFailed"), ctx.errorLabels), {
          hostId,
          projectId,
          threadId: ctx.state.selectedThreadId,
        });
      } finally {
        if (ctx.state.selectedHostId === hostId && ctx.state.selectedProjectId === projectId) {
          ctx.state.loading = false;
        }
      }
    },

    decorateThreads(threads: any[]) {
      const pinned = new Set(
        ctx.state.gatewayConfig.pinnedThreads.map((thread) =>
          pinnedKey(thread.hostId, thread.threadId),
        ),
      );
      return threads.map((thread) => ({
        ...thread,
        pinned: ctx.state.selectedHostId
          ? pinned.has(pinnedKey(ctx.state.selectedHostId, String(thread.id)))
          : false,
      }));
    },
  };
}

function syncThreadStatusesFromList(ctx: GatewayStoreContext, hostId: number, threads: any[]) {
  for (const thread of threads) {
    if (!thread?.id || !thread.status) {
      continue;
    }
    ctx.setThreadStatus(hostId, String(thread.id), runtimeStatusFromAppThreadStatus(thread.status));
  }
}
