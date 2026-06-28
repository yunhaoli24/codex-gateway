import type { ComposerTurnOptions, ThreadTurnsPageResult } from '~~/shared/types'
import type { GatewayStoreContext } from '../types'
import { insertSteerItemIntoActiveTurn, mergeItemIntoLatestTurn, mergeThreadTurns, messageFromError, pinnedKey } from '../thread-utils'

export function createThreadTurnActions(ctx: GatewayStoreContext) {
  return {
    async sendTurn(text: string, options: ComposerTurnOptions = {}) {
      if (!ctx.state.selectedHostId || !ctx.state.selectedThreadId) {
        return
      }
      const expectedSteerTurnId = activeRemoteTurnId(ctx.state.history)
      const shouldSteerActiveTurn = Boolean(expectedSteerTurnId) || ctx.selectedThreadStatus === 'running'
      const clientUserMessageId = `${shouldSteerActiveTurn ? 'steer' : 'turn'}-${globalThis.crypto?.randomUUID?.() || Date.now()}`
      if (!shouldSteerActiveTurn) {
        ctx.setThreadRunning(ctx.state.selectedHostId, ctx.state.selectedThreadId, true)
      }
      const optimisticContent = optimisticUserContent(text, options)
      if (shouldSteerActiveTurn) {
        if (!expectedSteerTurnId) {
          ctx.queuePendingSteer(ctx.state.selectedHostId, ctx.state.selectedThreadId, {
            text,
            clientUserMessageId,
            content: optimisticContent,
            images: options.images ?? [],
          })
          void ctx.flushPendingSteers(ctx.state.selectedHostId, ctx.state.selectedThreadId)
          return
        }
        ctx.state.history = insertSteerItemIntoActiveTurn(ctx.state.history, ctx.state.currentThread, ctx.state.selectedThreadId, expectedSteerTurnId, {
          type: 'userMessage',
          id: clientUserMessageId,
          clientId: clientUserMessageId,
          turnId: expectedSteerTurnId,
          content: optimisticContent,
        })
        ctx.cacheSelectedThreadSnapshot()
      } else {
        ctx.state.history = mergeItemIntoLatestTurn(ctx.state.history, ctx.state.currentThread, ctx.state.selectedThreadId, {
          type: 'userMessage',
          id: clientUserMessageId,
          clientId: clientUserMessageId,
          content: optimisticContent,
        })
        ctx.cacheSelectedThreadSnapshot()
      }
      ctx.state.loading = true
      ctx.state.error = null
      try {
        const result = shouldSteerActiveTurn
          ? await steerActiveTurn(ctx, text, clientUserMessageId, expectedSteerTurnId!, options)
          : await startNewTurn(ctx, text, clientUserMessageId, options)
        if (!shouldSteerActiveTurn && result?.turn) {
          ctx.state.history = mergeThreadTurns(ctx.state.history, ctx.state.currentThread, ctx.state.selectedThreadId, [result.turn], 'append')
          ctx.cacheSelectedThreadSnapshot()
          void ctx.flushPendingSteers(ctx.state.selectedHostId, ctx.state.selectedThreadId)
        }
        if (result?.turn?.items?.length) {
          for (const item of result.turn.items) {
            ctx.state.history = mergeItemIntoLatestTurn(ctx.state.history, ctx.state.currentThread, ctx.state.selectedThreadId, {
              ...item,
              turnId: result.turn.id,
            })
          }
        }
        if (shouldSteerActiveTurn && result?.turnId) {
          ctx.state.history = insertSteerItemIntoActiveTurn(ctx.state.history, ctx.state.currentThread, ctx.state.selectedThreadId, result.turnId, {
            type: 'userMessage',
            id: clientUserMessageId,
            clientId: clientUserMessageId,
            turnId: result.turnId,
            content: optimisticContent,
          })
          ctx.cacheSelectedThreadSnapshot()
        }
        if (!shouldSteerActiveTurn) {
          ctx.updateSelectedThreadSettings({
            ...(options.model !== undefined ? { model: options.model } : {}),
            ...(options.effort !== undefined ? { effort: options.effort } : {}),
            ...(options.approvalPolicy !== undefined ? { approvalPolicy: options.approvalPolicy } : {}),
          })
        }
      } catch (error: any) {
        ctx.setError(messageFromError(error, 'Failed to send message'))
        if (!shouldSteerActiveTurn) {
          ctx.setThreadRunning(ctx.state.selectedHostId, ctx.state.selectedThreadId, false)
        }
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
        ctx.cacheSelectedThreadSnapshot()
      } catch (error: any) {
        ctx.setError(messageFromError(error, 'Failed to load older turns'))
      } finally {
        ctx.state.loadingOlderTurns = false
      }
    },

    queuePendingSteer(hostId: number, threadId: string, steer: {
      text: string
      clientUserMessageId: string
      content: any[]
      images: ComposerTurnOptions['images']
    }) {
      const key = pinnedKey(hostId, threadId)
      ctx.state.pendingSteersByKey = {
        ...ctx.state.pendingSteersByKey,
        [key]: [
          ...(ctx.state.pendingSteersByKey[key] ?? []),
          {
            text: steer.text,
            clientUserMessageId: steer.clientUserMessageId,
            content: steer.content,
            images: steer.images ?? [],
          },
        ],
      }
    },

    async flushPendingSteers(hostId: number, threadId: string) {
      const key = pinnedKey(hostId, threadId)
      const pending = ctx.state.pendingSteersByKey[key] ?? []
      if (!pending.length) {
        return
      }
      const selected = ctx.state.selectedHostId === hostId && ctx.state.selectedThreadId === threadId
      if (!selected) {
        return
      }
      const expectedTurnId = activeRemoteTurnId(ctx.state.history)
      if (!expectedTurnId) {
        return
      }
      ctx.state.pendingSteersByKey = {
        ...ctx.state.pendingSteersByKey,
        [key]: [],
      }
      for (const steer of pending) {
        ctx.state.history = insertSteerItemIntoActiveTurn(ctx.state.history, ctx.state.currentThread, threadId, expectedTurnId, {
          type: 'userMessage',
          id: steer.clientUserMessageId,
          clientId: steer.clientUserMessageId,
          turnId: expectedTurnId,
          content: steer.content,
        })
        ctx.cacheSelectedThreadSnapshot()
        try {
          await steerActiveTurn(ctx, steer.text, steer.clientUserMessageId, expectedTurnId, { images: steer.images })
        } catch (error: any) {
          ctx.setError(messageFromError(error, 'Failed to send steer message'))
        }
      }
    },

    async respondToServerRequest(threadId: string, requestId: string | number, result: unknown) {
      if (!ctx.state.selectedHostId) {
        return
      }
      await $fetch('/api/server-requests/respond', {
        method: 'POST',
        body: {
          hostId: ctx.state.selectedHostId,
          threadId,
          requestId,
          result,
        },
      })
    },
  }
}

function optimisticUserContent(text: string, options: ComposerTurnOptions) {
  const imageContent = (options.images ?? []).map((image) => image.url
    ? { type: 'image', url: image.url, detail: image.detail }
    : { type: 'localImage', path: image.path, detail: image.detail })
  return [
    text ? { type: 'text', text, text_elements: [] } : null,
    ...imageContent,
  ].filter(Boolean)
}

function startNewTurn(ctx: GatewayStoreContext, text: string, clientUserMessageId: string, options: ComposerTurnOptions) {
  return $fetch<any>('/api/turns/start', {
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
}

function steerActiveTurn(ctx: GatewayStoreContext, text: string, clientUserMessageId: string, expectedTurnId: string, options: ComposerTurnOptions) {
  return $fetch<any>('/api/turns/steer', {
    method: 'POST',
    body: {
      hostId: ctx.state.selectedHostId,
      threadId: ctx.state.selectedThreadId,
      expectedTurnId,
      text,
      clientUserMessageId,
      images: options.images ?? [],
    },
  })
}

function activeRemoteTurnId(history: unknown) {
  const turns = (history as any)?.thread?.turns ?? (history as any)?.turns ?? []
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]
    const status = typeof turn?.status === 'string' ? turn.status : turn?.status?.type
    const id = turn?.id ? String(turn.id) : ''
    if (status === 'inProgress' && id && !id.startsWith('client-')) {
      return id
    }
  }
  return null
}
