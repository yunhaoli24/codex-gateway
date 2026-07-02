import type { PinnedThreadRecord, ProjectRecord } from "~~/shared/types";
import { gatewayApi } from "@/utils/gateway-api";
import type { GatewayStoreContext } from "../types";
import { pinnedKey, sortThreads, titleForThread } from "../thread-utils/identity";

export function createThreadPinningActions(ctx: GatewayStoreContext) {
  return {
    async setThreadPinned(threadId: string, pinned: boolean) {
      if (!ctx.state.selectedHostId) {
        return;
      }
      const project = ctx.state.projects.find(
        (candidate) => candidate.id === ctx.state.selectedProjectId,
      ) as ProjectRecord | undefined;
      const thread = ctx.state.threads.find((candidate) => String(candidate.id) === threadId);
      const key = pinnedKey(ctx.state.selectedHostId, threadId);
      ctx.state.gatewayConfig.pinnedThreads = ctx.state.gatewayConfig.pinnedThreads.filter(
        (item) => pinnedKey(item.hostId, item.threadId) !== key,
      );
      if (pinned) {
        ctx.state.gatewayConfig.pinnedThreads.unshift({
          hostId: ctx.state.selectedHostId,
          projectId: ctx.state.selectedProjectId,
          threadId,
          title: titleForThread(thread),
          subtitle: project?.remotePath ?? null,
          projectName: project?.name ?? null,
          updatedAt: Number(
            thread?.recencyAt || thread?.updatedAt || Math.floor(Date.now() / 1000),
          ),
        });
      }
      ctx.persistConfig();
      ctx.state.threads = sortThreads(
        ctx.state.threads.map((thread) =>
          String(thread.id) === threadId ? { ...thread, pinned } : thread,
        ),
      );
      await ctx.syncConfigToServer();
    },

    async setPinnedThread(thread: PinnedThreadRecord, pinned: boolean) {
      const key = pinnedKey(thread.hostId, thread.threadId);
      ctx.state.gatewayConfig.pinnedThreads = ctx.state.gatewayConfig.pinnedThreads.filter(
        (item) => pinnedKey(item.hostId, item.threadId) !== key,
      );
      if (pinned) {
        ctx.state.gatewayConfig.pinnedThreads.unshift(thread);
      }
      ctx.persistConfig();
      if (thread.hostId === ctx.state.selectedHostId) {
        ctx.state.threads = sortThreads(
          ctx.state.threads.map((candidate) =>
            String(candidate.id) === thread.threadId ? { ...candidate, pinned } : candidate,
          ),
        );
      }
      await ctx.syncConfigToServer();
    },

    async openPinnedThread(thread: PinnedThreadRecord) {
      const key = pinnedKey(thread.hostId, thread.threadId);
      ctx.state.openingPinnedThreadKey = key;
      try {
        await ctx.openThread(thread.threadId, {
          hostId: thread.hostId,
          projectId: thread.projectId,
        });
      } finally {
        ctx.state.openingPinnedThreadKey = null;
      }
    },

    upsertPinnedMetadataFromThread(thread: any) {
      if (!ctx.state.selectedHostId || !thread?.id) {
        return;
      }
      const key = pinnedKey(ctx.state.selectedHostId, String(thread.id));
      const index = ctx.state.gatewayConfig.pinnedThreads.findIndex(
        (item) => pinnedKey(item.hostId, item.threadId) === key,
      );
      if (index < 0) {
        return;
      }
      const pinnedThread = ctx.state.gatewayConfig.pinnedThreads[index];
      if (!pinnedThread) {
        return;
      }
      const project = ctx.state.projects.find(
        (candidate) => candidate.id === ctx.state.selectedProjectId,
      );
      ctx.state.gatewayConfig.pinnedThreads[index] = {
        ...pinnedThread,
        title: titleForThread(thread),
        projectName: project?.name ?? pinnedThread.projectName,
        subtitle: project?.remotePath ?? pinnedThread.subtitle,
        updatedAt: Number(
          thread.recencyAt ||
            thread.updatedAt ||
            pinnedThread.updatedAt ||
            Math.floor(Date.now() / 1000),
        ),
      };
      ctx.persistConfig();
      void ctx.syncConfigToServer().catch((error: any) => {
        ctx.setError(error?.message || ctx.t("app.configSyncFailed"));
      });
    },

    async renameThread(threadId: string, name: string) {
      if (!ctx.state.selectedHostId) {
        return;
      }
      await gatewayApi("/api/threads/rename", {
        method: "POST",
        body: {
          hostId: ctx.state.selectedHostId,
          threadId,
          name,
        },
      });
      ctx.state.threads = ctx.state.threads.map((thread) =>
        String(thread.id) === threadId ? { ...thread, name } : thread,
      );
      const key = pinnedKey(ctx.state.selectedHostId, threadId);
      ctx.state.gatewayConfig.pinnedThreads = ctx.state.gatewayConfig.pinnedThreads.map((thread) =>
        pinnedKey(thread.hostId, thread.threadId) === key ? { ...thread, title: name } : thread,
      );
      ctx.persistConfig();
      await ctx.syncConfigToServer();
      if (
        ctx.state.selectedThreadId === threadId &&
        ctx.state.currentThread &&
        typeof ctx.state.currentThread === "object"
      ) {
        ctx.state.currentThread = { ...(ctx.state.currentThread as Record<string, unknown>), name };
      }
      await ctx.listThreads();
    },
  };
}
