import type { ComposerTurnOptions, ThreadOpenResult } from '~~/shared/types'
import type { GatewayStoreContext } from '../types'
import { messageFromError, threadIdFromParams } from '../thread-utils'
import { writeGatewayRouteSelection } from '../route-state'
import { normalizeTokenUsage } from './realtime'

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

    syncSelectedRoute(options: { replace?: boolean } = {}) {
      writeGatewayRouteSelection({
        hostId: ctx.state.selectedHostId,
        projectId: ctx.state.selectedProjectId,
        threadId: ctx.state.selectedThreadId,
      }, options)
    },

    async openThread(threadId: string, context?: { hostId?: number, projectId?: number | null, replaceRoute?: boolean }) {
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
        ctx.syncSelectedRoute({ replace: context?.replaceRoute })
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
        if (result.tokenUsage) {
          ctx.setThreadTokenUsage(ctx.state.selectedHostId, threadId, result.tokenUsage)
        }
        ctx.state.events = result.recentEvents
        ctx.state.lastEventId = result.recentEvents.at(-1)?.id ?? 0
        if (!result.tokenUsage) {
          syncTokenUsageFromRecentEvents(ctx, result.recentEvents)
        }
        for (const event of result.recentEvents) {
          ctx.applyLiveEvent(event)
        }
        ctx.connectEvents()
        ctx.upsertPinnedMetadataFromThread(result.thread as any)
        ctx.rememberOpenThread(threadId)
        ctx.syncSelectedRoute({ replace: context?.replaceRoute })
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
      if (result.tokenUsage) {
        ctx.setThreadTokenUsage(ctx.state.selectedHostId, String(thread.id), result.tokenUsage)
      } else {
        syncTokenUsageFromRecentEvents(ctx, result.recentEvents)
      }
      ctx.connectEvents()
      await ctx.listThreads()
      ctx.rememberOpenThread(String(thread.id))
      ctx.syncSelectedRoute()
    },
  }
}

function syncTokenUsageFromRecentEvents(ctx: GatewayStoreContext, events: ThreadOpenResult['recentEvents']) {
  for (const event of events) {
    if (event.method !== 'thread/tokenUsage/updated') {
      continue
    }
    const params = (event.payload as any)?.params || {}
    const threadId = threadIdFromParams(params) || event.threadId
    const tokenUsage = normalizeTokenUsage(params.tokenUsage ?? params.token_usage)
    if (threadId && event.hostId && tokenUsage) {
      ctx.setThreadTokenUsage(event.hostId, String(threadId), tokenUsage)
    }
  }
}
