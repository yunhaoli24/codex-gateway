import type { ComposerTurnOptions, ThreadTurnsPageResult } from '~~/shared/types'
import type { GatewayStoreContext } from '../types'
import { mergeItemIntoLatestTurn, mergeThreadTurns, messageFromError } from '../thread-utils'

export function createThreadTurnActions(ctx: GatewayStoreContext) {
  return {
    async sendTurn(text: string, options: ComposerTurnOptions = {}) {
      if (!ctx.state.selectedHostId || !ctx.state.selectedThreadId) {
        return
      }
      const clientUserMessageId = globalThis.crypto?.randomUUID?.() || `client-${Date.now()}`
      ctx.setThreadRunning(ctx.state.selectedHostId, ctx.state.selectedThreadId, true)
      const imageContent = (options.images ?? []).map((image) => image.url
        ? { type: 'image', url: image.url, detail: image.detail }
        : { type: 'localImage', path: image.path, detail: image.detail })
      const optimisticContent = [
        text ? { type: 'text', text, text_elements: [] } : null,
        ...imageContent,
      ].filter(Boolean)
      ctx.state.history = mergeItemIntoLatestTurn(ctx.state.history, ctx.state.currentThread, ctx.state.selectedThreadId, {
        type: 'userMessage',
        id: clientUserMessageId,
        clientId: clientUserMessageId,
        content: optimisticContent,
      })
      ctx.state.loading = true
      ctx.state.error = null
      try {
        const result = await $fetch<any>('/api/turns/start', {
          method: 'POST',
          body: {
            hostId: ctx.state.selectedHostId,
            threadId: ctx.state.selectedThreadId,
            text,
            clientUserMessageId,
            cwd: ctx.selectedProject?.remotePath,
            model: options.model || undefined,
            effort: options.effort || undefined,
            approvalPolicy: options.approvalPolicy || undefined,
            images: options.images ?? [],
            files: options.files ?? [],
          },
        })
        if (result?.turn?.items?.length) {
          for (const item of result.turn.items) {
            ctx.state.history = mergeItemIntoLatestTurn(ctx.state.history, ctx.state.currentThread, ctx.state.selectedThreadId, item)
          }
        }
        ctx.updateSelectedThreadSettings({
          ...(options.model !== undefined ? { model: options.model } : {}),
          ...(options.effort !== undefined ? { effort: options.effort } : {}),
          ...(options.approvalPolicy !== undefined ? { approvalPolicy: options.approvalPolicy } : {}),
        })
      } catch (error: any) {
        ctx.setError(messageFromError(error, 'Failed to send message'))
        ctx.setThreadRunning(ctx.state.selectedHostId, ctx.state.selectedThreadId, false)
      } finally {
        ctx.state.loading = false
      }
    },

    async loadOlderTurns() {
      if (!ctx.state.selectedHostId || !ctx.state.selectedThreadId || !ctx.state.olderTurnsCursor || ctx.state.loadingOlderTurns) {
        return
      }

      ctx.state.loadingOlderTurns = true
      try {
        const result = await $fetch<ThreadTurnsPageResult>('/api/threads/turns', {
          query: {
            hostId: ctx.state.selectedHostId,
            threadId: ctx.state.selectedThreadId,
            cursor: ctx.state.olderTurnsCursor,
            limit: 20,
            sortDirection: 'desc',
          },
        })
        const turns = (result.history as any)?.thread?.turns ?? []
        ctx.state.history = mergeThreadTurns(ctx.state.history, ctx.state.currentThread, ctx.state.selectedThreadId, turns, 'prepend')
        ctx.state.olderTurnsCursor = result.turnsPage.nextCursor
        ctx.state.newerTurnsCursor = result.turnsPage.backwardsCursor ?? ctx.state.newerTurnsCursor
      } catch (error: any) {
        ctx.setError(messageFromError(error, 'Failed to load older turns'))
      } finally {
        ctx.state.loadingOlderTurns = false
      }
    },
  }
}
