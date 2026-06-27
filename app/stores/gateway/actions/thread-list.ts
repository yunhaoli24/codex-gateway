import type { GatewayStoreContext, ThreadListResponse } from '../types'
import { messageFromError, pinnedKey, runtimeStatusFromAppThreadStatus, sortThreads } from '../thread-utils'

export function createThreadListActions(ctx: GatewayStoreContext) {
  return {
    async connectAllHosts() {
      const hosts = [...ctx.state.hosts]
      if (!hosts.length) {
        return
      }

      await Promise.all(hosts.map(async (host) => {
        ctx.state.hostConnectionStatuses = {
          ...ctx.state.hostConnectionStatuses,
          [host.id]: { status: 'connecting', updatedAt: Date.now() },
        }
        try {
          const response = await $fetch<ThreadListResponse>('/api/threads', {
            query: {
              hostId: host.id,
              limit: 50,
              useStateDbOnly: true,
            },
          })
          if (response.projects) {
            ctx.mergeProjects(response.projects)
          }
          syncThreadStatusesFromList(ctx, host.id, response.data ?? [])
          ctx.state.hostConnectionStatuses = {
            ...ctx.state.hostConnectionStatuses,
            [host.id]: { status: 'connected', message: '已连接', updatedAt: Date.now() },
          }
        } catch (error: any) {
          ctx.state.hostConnectionStatuses = {
            ...ctx.state.hostConnectionStatuses,
            [host.id]: {
              status: 'failed',
              message: messageFromError(error, 'Failed to connect host'),
              updatedAt: Date.now(),
            },
          }
        }
      }))
      ctx.persistConfig()
    },

    async listThreads(searchTerm = '') {
      if (!ctx.state.selectedHostId) {
        return
      }

      ctx.state.loading = true
      ctx.state.error = null
      try {
        const query: Record<string, unknown> = {
          hostId: ctx.state.selectedHostId,
          limit: 50,
          useStateDbOnly: true,
        }
        if (ctx.state.selectedProjectId) {
          query.projectId = ctx.state.selectedProjectId
        }
        if (ctx.selectedProject?.remotePath) {
          query.cwd = ctx.selectedProject.remotePath
        }
        if (searchTerm) {
          query.searchTerm = searchTerm
        }
        const response = await $fetch<ThreadListResponse>('/api/threads', { query })
        if (response.projects) {
          ctx.mergeProjects(response.projects)
        }
        ctx.state.hostConnectionStatuses = {
          ...ctx.state.hostConnectionStatuses,
          [ctx.state.selectedHostId]: { status: 'connected', message: '已连接', updatedAt: Date.now() },
        }
        syncThreadStatusesFromList(ctx, ctx.state.selectedHostId, response.data ?? [])
        ctx.state.threads = sortThreads(ctx.decorateThreads(response.data ?? []))
        ctx.persistConfig()
      } catch (error: any) {
        ctx.state.hostConnectionStatuses = {
          ...ctx.state.hostConnectionStatuses,
          [ctx.state.selectedHostId]: {
            status: 'failed',
            message: messageFromError(error, 'Failed to list threads'),
            updatedAt: Date.now(),
          },
        }
        ctx.setError(messageFromError(error, 'Failed to list threads'))
      } finally {
        ctx.state.loading = false
      }
    },

    decorateThreads(threads: any[]) {
      const pinned = new Set(ctx.state.gatewayConfig.pinnedThreads.map((thread) => pinnedKey(thread.hostId, thread.threadId)))
      return threads.map((thread) => ({
        ...thread,
        pinned: ctx.state.selectedHostId ? pinned.has(pinnedKey(ctx.state.selectedHostId, String(thread.id))) : false,
      }))
    },
  }
}

function syncThreadStatusesFromList(ctx: GatewayStoreContext, hostId: number, threads: any[]) {
  for (const thread of threads) {
    if (!thread?.id || !thread.status) {
      continue
    }
    ctx.setThreadStatus(hostId, String(thread.id), runtimeStatusFromAppThreadStatus(thread.status))
  }
}
