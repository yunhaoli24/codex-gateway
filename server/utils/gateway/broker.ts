import type { ApprovalPolicy, GatewayEvent, HostRecord, ReasoningEffort, ThreadSettingsState, ThreadTokenUsageState } from '~~/shared/types'
import { randomUUID } from 'node:crypto'
import { persistence } from './db'
import { CodexRpcClient } from './rpc'

type Subscriber = (event: GatewayEvent) => void
type CloseSubscriber = () => void

const DEFAULT_TURN_PAGE_LIMIT = 20

interface TurnsPage {
  data?: any[]
  nextCursor?: string | null
  backwardsCursor?: string | null
}

interface TurnStartInput {
  text: string
  cwd?: string | null
  clientUserMessageId?: string | null
  model?: string | null
  effort?: ReasoningEffort | null
  approvalPolicy?: ApprovalPolicy | null
  images?: Array<{
    path?: string
    url?: string
    detail?: 'low' | 'high' | 'auto' | 'original'
  }>
  files?: Array<{
    path: string
    name: string
    mimeType?: string | null
    size: number
    isImage: boolean
  }>
}

interface TurnSteerInput {
  text: string
  expectedTurnId: string
  clientUserMessageId?: string | null
  images?: Array<{
    path?: string
    url?: string
    detail?: 'low' | 'high' | 'auto' | 'original'
  }>
}

function pageToHistory(thread: any, page: TurnsPage) {
  const turns = [...(page.data ?? [])].reverse()
  return {
    thread: {
      ...thread,
      turns,
    },
  }
}

function buildUserInput(input: { text: string, images?: TurnStartInput['images'] }) {
  const userInput: any[] = []
  if (input.text.trim()) {
    userInput.push({ type: 'text', text: input.text, text_elements: [] })
  }
  for (const image of input.images ?? []) {
    if (image.url) {
      userInput.push({
        type: 'image',
        url: image.url,
        detail: image.detail,
      })
    } else if (image.path) {
      userInput.push({
        type: 'localImage',
        path: image.path,
        detail: image.detail,
      })
    }
  }
  return userInput
}

function normalizeApprovalPolicy(value: unknown): ApprovalPolicy | null {
  return value === 'untrusted' || value === 'on-request' || value === 'never' ? value : null
}

function extractThreadSettings(source: any): ThreadSettingsState {
  const threadSettings = source?.threadSettings
  return {
    model: typeof (threadSettings?.model ?? source?.model) === 'string' ? (threadSettings?.model ?? source?.model) : null,
    effort: typeof (threadSettings?.effort ?? source?.reasoningEffort) === 'string' ? (threadSettings?.effort ?? source?.reasoningEffort) : null,
    approvalPolicy: normalizeApprovalPolicy(threadSettings?.approvalPolicy ?? source?.approvalPolicy),
  }
}

function latestTokenUsageFromEvents(events: GatewayEvent[]): ThreadTokenUsageState | null {
  for (const event of [...events].sort((left, right) => right.id - left.id)) {
    if (event.method !== 'thread/tokenUsage/updated') {
      continue
    }
    const tokenUsage = normalizeTokenUsage((event.payload as any)?.params?.tokenUsage)
    if (tokenUsage) {
      return tokenUsage
    }
  }
  return null
}

function normalizeTokenUsage(value: any): ThreadTokenUsageState | null {
  const total = normalizeTokenBreakdown(value?.total)
  const last = normalizeTokenBreakdown(value?.last)
  if (!total || !last) {
    return null
  }
  const modelContextWindow = numberOrNull(value?.modelContextWindow)
  return { total, last, modelContextWindow }
}

function normalizeTokenBreakdown(value: any) {
  const totalTokens = numberOrNull(value?.totalTokens)
  const inputTokens = numberOrNull(value?.inputTokens)
  const cachedInputTokens = numberOrNull(value?.cachedInputTokens)
  const outputTokens = numberOrNull(value?.outputTokens)
  const reasoningOutputTokens = numberOrNull(value?.reasoningOutputTokens)
  if ([totalTokens, inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens].some((item) => item == null)) {
    return null
  }
  return { totalTokens, inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens }
}

function numberOrNull(value: unknown) {
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

class ThreadController {
  readonly client: CodexRpcClient
  readonly subscribers = new Set<Subscriber>()
  readonly closeSubscribers = new Set<CloseSubscriber>()
  readonly buffer: GatewayEvent[] = []
  private operationQueue: Promise<unknown> = Promise.resolve()
  private connected = false
  private subscribed = false
  private closed = false

  constructor(
    readonly host: HostRecord,
    readonly threadId: string,
    client?: CodexRpcClient,
    connected = false,
    subscribed = false,
    private readonly onClose?: () => void,
  ) {
    this.client = client ?? new CodexRpcClient(host)
    this.connected = connected
    this.subscribed = subscribed
    this.client.on('notification', (message: any) => {
      const method = message.method || 'notification'
      const event = persistence.addGatewayEvent(host.id, this.threadId, method, message)
      this.buffer.push(event)
      if (this.buffer.length > 200) {
        this.buffer.shift()
      }
      for (const subscriber of this.subscribers) {
        subscriber(event)
      }
    })
    this.client.on('stderr', (text) => {
      const event = persistence.addGatewayEvent(host.id, this.threadId, 'gateway/stderr', {
        method: 'gateway/stderr',
        params: { text },
      })
      for (const subscriber of this.subscribers) {
        subscriber(event)
      }
    })
    this.client.on('close', () => {
      this.closed = true
      this.connected = false
      this.subscribed = false
      for (const subscriber of this.closeSubscribers) {
        subscriber()
      }
      this.closeSubscribers.clear()
      this.onClose?.()
    })
  }

  publish(method: string, payload: any) {
    const event = persistence.addGatewayEvent(this.host.id, this.threadId, method, payload)
    this.buffer.push(event)
    if (this.buffer.length > 200) {
      this.buffer.shift()
    }
    for (const subscriber of this.subscribers) {
      subscriber(event)
    }
    return event
  }

  async ensureConnected() {
    if (this.closed) {
      throw new Error('Thread controller is closed')
    }
    if (!this.connected) {
      await this.client.connect()
      this.connected = true
    }
  }

  markConnected() {
    this.connected = true
  }

  async ensureSubscribed() {
    await this.ensureConnected()
    if (this.subscribed) {
      return
    }

    await this.enqueue(() => this.client.request<any>('thread/resume', {
      threadId: this.threadId,
    }))
    this.subscribed = true
  }

  async resumeWithInitialTurns(limit = DEFAULT_TURN_PAGE_LIMIT) {
    await this.ensureConnected()
    const resume = await this.enqueue(() => this.client.request<any>('thread/resume', {
      threadId: this.threadId,
      initialTurnsPage: {
        limit,
        sortDirection: 'desc',
        itemsView: 'full',
      },
    }))
    this.subscribed = true
    return resume
  }

  enqueue<T>(operation: () => Promise<T>) {
    const run = this.operationQueue.then(operation, operation)
    this.operationQueue = run.catch(() => {})
    return run
  }

  subscribe(callback: Subscriber, onClose?: CloseSubscriber) {
    this.subscribers.add(callback)
    if (onClose) {
      this.closeSubscribers.add(onClose)
    }
    return () => {
      this.subscribers.delete(callback)
      if (onClose) {
        this.closeSubscribers.delete(onClose)
      }
    }
  }

  close() {
    if (this.closed) {
      return
    }
    this.closed = true
    if (this.connected) {
      void this.client.request('thread/unsubscribe', { threadId: this.threadId }, 5_000).catch(() => {})
    }
    this.subscribed = false
    this.client.close()
    for (const subscriber of this.closeSubscribers) {
      subscriber()
    }
    this.subscribers.clear()
    this.closeSubscribers.clear()
    this.onClose?.()
  }
}

class ThreadBroker {
  private controllers = new Map<string, ThreadController>()

  async openThread(host: HostRecord, threadId: string, projectId: number | null, limit = DEFAULT_TURN_PAGE_LIMIT) {
    const controller = await this.getController(host, threadId)
    const resume = await controller.resumeWithInitialTurns(limit)
    const thread = resume.thread ?? resume
    const initialTurnsPage = resume.initialTurnsPage
    if (!initialTurnsPage) {
      throw new Error('thread/resume did not return initialTurnsPage')
    }
    const threadRecord = thread.thread ?? thread
    let resolvedProjectId = projectId
    if (!resolvedProjectId && typeof threadRecord?.cwd === 'string' && threadRecord.cwd.trim()) {
      resolvedProjectId = persistence.ensureProjectForPath(host.id, threadRecord.cwd).id
    }
    persistence.recordThread(host.id, resolvedProjectId, threadRecord)
    const recentEvents = persistence.listGatewayEvents(host.id, threadId, 0, 200)
    return {
      thread,
      history: this.pageToFullHistory(thread, initialTurnsPage),
      projectId: resolvedProjectId,
      project: resolvedProjectId ? persistence.getProject(resolvedProjectId) : null,
      turnsPage: {
        nextCursor: initialTurnsPage.nextCursor ?? null,
        backwardsCursor: initialTurnsPage.backwardsCursor ?? null,
      },
      threadSettings: extractThreadSettings(resume),
      tokenUsage: latestTokenUsageFromEvents(recentEvents),
      recentEvents,
    }
  }

  async startThread(host: HostRecord, params: Record<string, unknown>, projectId: number | null) {
    const client = new CodexRpcClient(host)
    try {
      await client.connect()
      const result = await client.request<any>('thread/start', params)
      const thread = {
        ...(result.thread ?? result),
        cwd: (result.thread ?? result)?.cwd ?? params.cwd ?? null,
      }
      persistence.recordThread(host.id, projectId, thread)
      const threadId = String(thread.id)
      const key = this.key(host.id, threadId)
      this.controllers.get(key)?.close()
      const controller = new ThreadController(host, threadId, client, true, true, () => {
        if (this.controllers.get(key) === controller) {
          this.controllers.delete(key)
        }
      })
      this.controllers.set(key, controller)
      const recentEvents = persistence.listGatewayEvents(host.id, threadId, 0, 200).concat(controller.buffer)
      return {
        thread,
        history: { thread: { ...thread, turns: thread.turns ?? [] } },
        threadSettings: extractThreadSettings(result),
        tokenUsage: latestTokenUsageFromEvents(recentEvents),
        turnsPage: {
          nextCursor: null,
          backwardsCursor: null,
        },
        recentEvents,
      }
    } catch (error) {
      client.close()
      throw error
    }
  }

  async startTurn(host: HostRecord, threadId: string, input: TurnStartInput) {
    const controller = await this.getController(host, threadId)
    await controller.ensureSubscribed()
    const clientUserMessageId = input.clientUserMessageId || `gateway-${randomUUID()}`
    const result = await controller.enqueue(() => controller.client.request<any>('turn/start', {
      threadId,
      clientUserMessageId,
      input: buildUserInput(input),
      cwd: input.cwd || null,
      model: input.model || null,
      effort: input.effort || null,
      approvalPolicy: input.approvalPolicy || null,
    }))
    if (result?.turn) {
      controller.publish('turn/started', {
        method: 'turn/started',
        params: {
          threadId,
          turn: result.turn,
        },
      })
      controller.publish('item/started', {
        method: 'item/started',
        params: {
          threadId,
          turnId: result.turn.id,
          item: {
            type: 'userMessage',
            id: clientUserMessageId,
            clientId: clientUserMessageId,
            content: buildUserInput(input),
          },
        },
      })
    }
    return result
  }

  async steerTurn(host: HostRecord, threadId: string, input: TurnSteerInput) {
    const controller = await this.getController(host, threadId)
    await controller.ensureSubscribed()
    return controller.enqueue(() => controller.client.request('turn/steer', {
      threadId,
      expectedTurnId: input.expectedTurnId,
      clientUserMessageId: input.clientUserMessageId || undefined,
      input: buildUserInput(input),
    }))
  }

  async updateThreadSettings(host: HostRecord, threadId: string, input: ThreadSettingsState) {
    const controller = await this.getController(host, threadId)
    await controller.ensureSubscribed()
    const params: Record<string, unknown> = { threadId }
    if ('model' in input) params.model = input.model
    if ('effort' in input) params.effort = input.effort
    if ('approvalPolicy' in input) params.approvalPolicy = input.approvalPolicy
    return controller.enqueue(() => controller.client.request('thread/settings/update', params))
  }

  async listThreads(host: HostRecord, params: Record<string, unknown>) {
    const client = new CodexRpcClient(host)
    await client.connect()
    try {
      return await client.request('thread/list', params)
    } finally {
      client.close()
    }
  }

  async listModels(host: HostRecord, params: Record<string, unknown>) {
    const client = new CodexRpcClient(host)
    await client.connect()
    try {
      return await client.request('model/list', params)
    } finally {
      client.close()
    }
  }

  async renameThread(host: HostRecord, threadId: string, name: string) {
    const controller = await this.getController(host, threadId)
    await controller.ensureSubscribed()
    return controller.enqueue(() => controller.client.request('thread/name/set', { threadId, name }))
  }

  async listThreadTurns(host: HostRecord, threadId: string, params: {
    cursor?: string | null
    limit?: number
    sortDirection?: 'asc' | 'desc'
  }) {
    const controller = await this.getController(host, threadId)
    await controller.ensureSubscribed()
    const page = await controller.enqueue(() => controller.client.request<TurnsPage>('thread/turns/list', {
      threadId,
      cursor: params.cursor ?? null,
      limit: params.limit ?? DEFAULT_TURN_PAGE_LIMIT,
      sortDirection: params.sortDirection ?? 'desc',
      itemsView: 'full',
    }))
    return {
      history: this.pageToFullHistory({ id: threadId }, page),
      turnsPage: {
        nextCursor: page.nextCursor ?? null,
        backwardsCursor: page.backwardsCursor ?? null,
      },
    }
  }

  private pageToFullHistory(thread: any, page: TurnsPage) {
    const turns = [...(page.data ?? [])].reverse()
    return {
      thread: {
        ...thread,
        turns,
      },
    }
  }

  async getController(host: HostRecord, threadId: string) {
    const key = this.key(host.id, threadId)
    let controller = this.controllers.get(key)
    if (!controller) {
      controller = new ThreadController(host, threadId, undefined, false, false, () => {
        if (this.controllers.get(key) === controller) {
          this.controllers.delete(key)
        }
      })
      this.controllers.set(key, controller)
    }
    await controller.ensureConnected()
    return controller
  }

  async subscribe(host: HostRecord, threadId: string, callback: Subscriber, onClose?: CloseSubscriber) {
    const controller = await this.getController(host, threadId)
    await controller.ensureSubscribed()
    return controller.subscribe(callback, onClose)
  }

  close(hostId: number, threadId: string) {
    const key = this.key(hostId, threadId)
    this.controllers.get(key)?.close()
    this.controllers.delete(key)
  }

  status() {
    return Array.from(this.controllers.values()).map((controller) => ({
      hostId: controller.host.id,
      threadId: controller.threadId,
      subscribers: controller.subscribers.size,
      eventBufferSize: controller.buffer.length,
    }))
  }

  private key(hostId: number, threadId: string) {
    return `${hostId}:${threadId}`
  }
}

export const threadBroker = new ThreadBroker()
