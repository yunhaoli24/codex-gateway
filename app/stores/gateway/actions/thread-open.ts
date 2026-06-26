import type { ComposerTurnOptions, ThreadOpenResult } from '~~/shared/types'
import type { GatewayStoreContext } from '../types'
import { messageFromError } from '../thread-utils'

export function createThreadOpenActions(ctx: GatewayStoreContext) {
  return {
    rememberOpenThread(threadId: string) {
      if (!ctx.state.selectedHostId) {
        return
      }
      ctx.state.gatewayConfig.lastOpenThread = {
        hostId: ctx.state.selectedHostId,
        projectId: ctx.state.selectedProjectId,
        threadId,
      }
      ctx.persistConfig()
    },

    requestScrollToLatest() {
      ctx.state.scrollToLatestToken += 1
    },

    async openThread(threadId: string, context?: { hostId?: number, projectId?: number | null }) {
      if (context?.hostId && context.hostId !== ctx.state.selectedHostId) {
        ctx.state.selectedHostId = context.hostId
        ctx.state.selectedProjectId = context.projectId ?? null
        ctx.state.selectedThreadId = null
        ctx.state.currentThread = null
        ctx.state.history = null
        ctx.state.events = []
        ctx.state.olderTurnsCursor = null
        ctx.state.newerTurnsCursor = null
      } else if (context && 'projectId' in context && context.projectId !== ctx.state.selectedProjectId) {
        ctx.state.selectedProjectId = context.projectId ?? null
        ctx.state.selectedThreadId = null
        ctx.state.currentThread = null
        ctx.state.history = null
        ctx.state.events = []
        ctx.state.olderTurnsCursor = null
        ctx.state.newerTurnsCursor = null
      }
      if (!ctx.state.selectedHostId) {
        return
      }
      if (ctx.state.selectedThreadId === threadId && ctx.state.currentThread && ctx.state.history) {
        ctx.rememberOpenThread(threadId)
        ctx.requestScrollToLatest()
        return
      }

      ctx.state.loading = true
      ctx.state.error = null
      try {
        const result = await $fetch<ThreadOpenResult>('/api/threads/open', {
          method: 'POST',
          body: {
            hostId: ctx.state.selectedHostId,
            projectId: ctx.state.selectedProjectId,
            threadId,
            limit: 20,
          },
        })
        ctx.state.currentThread = result.thread
        ctx.state.history = result.history
        if (result.projectId) {
          ctx.state.selectedProjectId = result.projectId
        }
        ctx.state.selectedThreadId = threadId
        if (result.project) {
          ctx.mergeProjects([result.project])
        }
        ctx.state.olderTurnsCursor = result.turnsPage.nextCursor
        ctx.state.newerTurnsCursor = result.turnsPage.backwardsCursor
        ctx.setThreadSettings(ctx.state.selectedHostId, threadId, result.threadSettings)
        ctx.state.events = result.recentEvents
        ctx.state.lastEventId = result.recentEvents.at(-1)?.id ?? 0
        for (const event of result.recentEvents) {
          ctx.applyLiveEvent(event)
        }
        ctx.connectEvents()
        ctx.upsertPinnedMetadataFromThread(result.thread as any)
        ctx.rememberOpenThread(threadId)
        ctx.requestScrollToLatest()
      } catch (error: any) {
        ctx.setError(messageFromError(error, 'Failed to open thread'))
      } finally {
        ctx.state.loading = false
      }
    },

    async restoreLastOpenThread() {
      const last = ctx.state.gatewayConfig.lastOpenThread
      if (!last || !ctx.state.hosts.some((host) => host.id === last.hostId)) {
        return
      }
      await ctx.openThread(last.threadId, {
        hostId: last.hostId,
        projectId: last.projectId,
      })
    },

    async startThread(options: ComposerTurnOptions = {}) {
      if (!ctx.state.selectedHostId) {
        return
      }
      const result = await $fetch<ThreadOpenResult>('/api/threads/start', {
        method: 'POST',
        body: {
          hostId: ctx.state.selectedHostId,
          projectId: ctx.state.selectedProjectId,
          cwd: ctx.selectedProject?.remotePath,
          model: options.model || undefined,
          effort: options.effort || undefined,
          approvalPolicy: options.approvalPolicy || undefined,
        },
      })
      const thread = result.thread as any
      ctx.state.currentThread = result.thread
      ctx.state.history = result.history
      ctx.state.events = result.recentEvents
      ctx.state.olderTurnsCursor = result.turnsPage.nextCursor
      ctx.state.newerTurnsCursor = result.turnsPage.backwardsCursor
      ctx.state.selectedThreadId = String(thread.id)
      ctx.setThreadSettings(ctx.state.selectedHostId, String(thread.id), result.threadSettings)
      ctx.connectEvents()
      await ctx.listThreads()
    },
  }
}
