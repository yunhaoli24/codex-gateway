import type { ApprovalPolicy, GatewayEvent, HostRecord, ReasoningEffort, ThreadSettingsState } from '~~/shared/types'
import { persistence } from './db'
import { CodexRpcClient } from './rpc'

type Subscriber = (event: GatewayEvent) => void

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

function pageToHistory(thread: any, page: TurnsPage) {
  const turns = [...(page.data ?? [])].reverse()
  return {
    thread: {
      ...thread,
      turns,
    },
  }
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

class ThreadController {
  readonly client: CodexRpcClient
  readonly subscribers = new Set<Subscriber>()
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
      this.onClose?.()
    })
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
      excludeTurns: true,
    }))
    this.subscribed = true
  }

  async resumeWithInitialTurns(limit = DEFAULT_TURN_PAGE_LIMIT) {
    await this.ensureConnected()
    const resume = await this.enqueue(() => this.client.request<any>('thread/resume', {
      threadId: this.threadId,
      excludeTurns: true,
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

  subscribe(callback: Subscriber) {
    this.subscribers.add(callback)
    return () => {
      this.subscribers.delete(callback)
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
    this.subscribers.clear()
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
    return {
      thread,
      history: pageToHistory(thread, initialTurnsPage),
      projectId: resolvedProjectId,
      project: resolvedProjectId ? persistence.getProject(resolvedProjectId) : null,
      turnsPage: {
        nextCursor: initialTurnsPage.nextCursor ?? null,
        backwardsCursor: initialTurnsPage.backwardsCursor ?? null,
      },
      threadSettings: extractThreadSettings(resume),
      recentEvents: persistence.listGatewayEvents(host.id, threadId, 0, 200),
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
      return {
        thread,
        history: { thread: { ...thread, turns: thread.turns ?? [] } },
        threadSettings: extractThreadSettings(result),
        turnsPage: {
          nextCursor: null,
          backwardsCursor: null,
        },
        recentEvents: persistence.listGatewayEvents(host.id, threadId, 0, 200).concat(controller.buffer),
      }
    } catch (error) {
      client.close()
      throw error
    }
  }

  async startTurn(host: HostRecord, threadId: string, input: TurnStartInput) {
    const controller = await this.getController(host, threadId)
    await controller.ensureSubscribed()
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
    return controller.enqueue(() => controller.client.request('turn/start', {
      threadId,
      clientUserMessageId: input.clientUserMessageId || undefined,
      input: userInput,
      cwd: input.cwd || null,
      model: input.model || null,
      effort: input.effort || null,
      approvalPolicy: input.approvalPolicy || null,
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
      history: pageToHistory({ id: threadId }, page),
      turnsPage: {
        nextCursor: page.nextCursor ?? null,
        backwardsCursor: page.backwardsCursor ?? null,
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

  async subscribe(host: HostRecord, threadId: string, callback: Subscriber) {
    const controller = await this.getController(host, threadId)
    await controller.ensureSubscribed()
    return controller.subscribe(callback)
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
