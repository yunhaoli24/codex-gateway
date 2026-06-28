import type { ApprovalPolicy, GatewayEvent, HostRecord, ReasoningEffort, ThreadSettingsState, ThreadTokenUsageState } from '~~/shared/types'
import { buildCurrentTimeReadResponse, isCurrentTimeReadRequest } from '~~/shared/server-requests'
import { normalizeTokenUsage } from '~~/shared/token-usage'
import { randomUUID } from 'node:crypto'
import { runtimeState } from './runtime-state'
import { CodexRpcClient } from './rpc'

type Subscriber = (event: GatewayEvent) => void
type CloseSubscriber = () => void

const DEFAULT_TURN_PAGE_LIMIT = 20

interface TurnsPage {
  data?: any[]
  nextCursor?: string | null
  backwardsCursor?: string | null
}

interface ThreadOpenSnapshot {
  thread: any
  history: any
  projectId: number | null
  turnsPage: {
    nextCursor: string | null
    backwardsCursor: string | null
  }
  threadSettings: ThreadSettingsState
  tokenUsage: ThreadTokenUsageState | null
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

interface ServerRequestResponseInput {
  requestId: string | number
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
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

class ThreadController {
  readonly client: CodexRpcClient
  readonly subscribers = new Set<Subscriber>()
  readonly closeSubscribers = new Set<CloseSubscriber>()
  readonly buffer: GatewayEvent[] = []
  private operationQueue: Promise<unknown> = Promise.resolve()
  private connected = false
  private subscribed = false
  private closed = false
  private openSnapshot: ThreadOpenSnapshot | null = null

  constructor(
    readonly host: HostRecord,
    readonly threadId: string,
    client?: CodexRpcClient,
    connected = false,
    subscribed = false,
    private readonly ownsClient = true,
    private readonly onClose?: () => void,
  ) {
    this.client = client ?? new CodexRpcClient(host)
    this.connected = connected
    this.subscribed = subscribed
    if (this.ownsClient) {
      this.client.on('notification', (message: any) => this.handleNotification(message))
      this.client.on('stderr', (text) => this.handleStderr(text))
      this.client.on('close', () => this.handleClose())
    }
  }

  publish(method: string, payload: any) {
    const event = runtimeState.addGatewayEvent(this.host.id, this.threadId, method, payload)
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

  handleNotification(message: any) {
    const method = message.method || 'notification'
    const event = runtimeState.addGatewayEvent(this.host.id, this.threadId, method, message)
    this.buffer.push(event)
    if (this.buffer.length > 200) {
      this.buffer.shift()
    }
    for (const subscriber of this.subscribers) {
      subscriber(event)
    }
  }

  handleStderr(text: string) {
    const event = runtimeState.addGatewayEvent(this.host.id, this.threadId, 'gateway/stderr', {
      method: 'gateway/stderr',
      params: { text },
    })
    for (const subscriber of this.subscribers) {
      subscriber(event)
    }
  }

  handleClose() {
    this.connected = false
    this.subscribed = false
    for (const subscriber of this.closeSubscribers) {
      subscriber()
    }
    this.closeSubscribers.clear()
  }

  async ensureSubscribed() {
    await this.ensureConnected()
    if (this.subscribed) {
      return
    }
    if (this.isFreshUnmaterializedThread()) {
      this.subscribed = true
      return
    }

    await this.enqueue(() => this.client.request<any>('thread/resume', {
      threadId: this.threadId,
    }))
    this.subscribed = true
  }

  isSubscribed() {
    return this.subscribed
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

  setOpenSnapshot(snapshot: ThreadOpenSnapshot) {
    this.openSnapshot = snapshot
  }

  getOpenSnapshot() {
    return this.openSnapshot
  }

  private isFreshUnmaterializedThread() {
    const turns = (this.openSnapshot?.history as any)?.thread?.turns
    return Boolean(this.openSnapshot && Array.isArray(turns) && turns.length === 0)
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
    if (this.ownsClient) {
      this.client.close()
    }
    for (const subscriber of this.closeSubscribers) {
      subscriber()
    }
    this.subscribers.clear()
    this.closeSubscribers.clear()
    this.onClose?.()
  }

  disposeAfterTransportClose() {
    if (this.closed) {
      return
    }
    this.closed = true
    this.connected = false
    this.subscribed = false
    for (const subscriber of this.closeSubscribers) {
      subscriber()
    }
    this.subscribers.clear()
    this.closeSubscribers.clear()
    this.onClose?.()
  }
}

class HostRpcSession {
  readonly client: CodexRpcClient
  private connected = false
  private connectPromise: Promise<CodexRpcClient> | null = null

  constructor(
    readonly host: HostRecord,
    private readonly controllerForThread: (hostId: number, threadId: string) => ThreadController | null,
    private readonly controllersForHost: (hostId: number) => ThreadController[],
    private readonly onClose?: () => void,
  ) {
    this.client = new CodexRpcClient(host)
    this.client.on('notification', (message: any) => this.routeNotification(message))
    this.client.on('request', (message: any) => this.routeRequest(message))
    this.client.on('stderr', (text) => this.routeStderr(text))
    this.client.on('close', () => {
      this.connected = false
      this.onClose?.()
    })
  }

  async connect() {
    if (this.connected) {
      return this.client
    }
    if (!this.connectPromise) {
      this.connectPromise = this.client.connect().then(() => {
        this.connected = true
        return this.client
      }).finally(() => {
        this.connectPromise = null
      })
    }
    return this.connectPromise
  }

  private routeNotification(message: any) {
    const threadId = threadIdFromNotification(message)
    if (!threadId) {
      return
    }
    const controller = this.controllerForThread(this.host.id, threadId)
    if (controller) {
      controller.handleNotification(message)
    } else {
      runtimeState.addGatewayEvent(this.host.id, threadId, message.method || 'notification', message)
    }
  }

  private routeRequest(message: any) {
    const threadId = threadIdFromNotification(message)
    if (!threadId) {
      runtimeState.addGatewayEvent(this.host.id, 'gateway', message.method || 'request', message)
      return
    }
    if (isCurrentTimeReadRequest(message)) {
      this.client.respond(message.id!, buildCurrentTimeReadResponse())
      return
    }
    const controller = this.controllerForThread(this.host.id, threadId)
    if (controller) {
      controller.handleNotification(message)
    } else {
      runtimeState.addGatewayEvent(this.host.id, threadId, message.method || 'request', message)
    }
  }

  private routeStderr(text: string) {
    for (const controller of this.controllersForHost(this.host.id)) {
      controller.handleStderr(text)
    }
  }

  close() {
    this.connected = false
    this.client.close()
  }
}

class ThreadBroker {
  private controllers = new Map<string, ThreadController>()
  private hostSessions = new Map<number, HostRpcSession>()

  async openThread(host: HostRecord, threadId: string, projectId: number | null, limit = DEFAULT_TURN_PAGE_LIMIT) {
    const controller = await this.getController(host, threadId)
    const activeSnapshot = controller.getOpenSnapshot()
    if (activeSnapshot) {
      const recentEvents = runtimeState.listGatewayEvents(host.id, threadId, 0, 200)
      const resolvedProjectId = activeSnapshot.projectId ?? projectId
      return {
        thread: activeSnapshot.thread,
        history: activeSnapshot.history,
        projectId: resolvedProjectId,
        project: resolvedProjectId ? runtimeState.getProject(resolvedProjectId) : null,
        turnsPage: activeSnapshot.turnsPage,
        threadSettings: activeSnapshot.threadSettings,
        tokenUsage: latestTokenUsageFromEvents(recentEvents) ?? activeSnapshot.tokenUsage,
        recentEvents,
      }
    }
    const resume = await controller.resumeWithInitialTurns(limit)
    const thread = resume.thread ?? resume
    const initialTurnsPage = resume.initialTurnsPage
    if (!initialTurnsPage) {
      throw new Error('thread/resume did not return initialTurnsPage')
    }
    const threadRecord = thread.thread ?? thread
    let resolvedProjectId = projectId
    if (!resolvedProjectId && typeof threadRecord?.cwd === 'string' && threadRecord.cwd.trim()) {
      resolvedProjectId = runtimeState.ensureProjectForPath(host.id, threadRecord.cwd).id
    }
    runtimeState.recordThread(host.id, resolvedProjectId, threadRecord)
    const recentEvents = runtimeState.listGatewayEvents(host.id, threadId, 0, 200)
    const history = this.pageToFullHistory(thread, initialTurnsPage)
    const turnsPage = {
      nextCursor: initialTurnsPage.nextCursor ?? null,
      backwardsCursor: initialTurnsPage.backwardsCursor ?? null,
    }
    controller.setOpenSnapshot({
      thread,
      history,
      projectId: resolvedProjectId,
      turnsPage,
      threadSettings: extractThreadSettings(resume),
      tokenUsage: latestTokenUsageFromEvents(recentEvents),
    })
    return {
      thread,
      history,
      projectId: resolvedProjectId,
      project: resolvedProjectId ? runtimeState.getProject(resolvedProjectId) : null,
      turnsPage,
      threadSettings: extractThreadSettings(resume),
      tokenUsage: latestTokenUsageFromEvents(recentEvents),
      recentEvents,
    }
  }

  async startThread(host: HostRecord, params: Record<string, unknown>, projectId: number | null) {
    const client = await this.getHostClient(host)
    try {
      const result = await client.request<any>('thread/start', params)
      const thread = {
        ...(result.thread ?? result),
        cwd: (result.thread ?? result)?.cwd ?? params.cwd ?? null,
      }
      runtimeState.recordThread(host.id, projectId, thread)
      const threadId = String(thread.id)
      const key = this.key(host.id, threadId)
      this.controllers.get(key)?.close()
      const controller = new ThreadController(host, threadId, client, true, true, false, () => {
        if (this.controllers.get(key) === controller) {
          this.controllers.delete(key)
        }
      })
      this.controllers.set(key, controller)
      const recentEvents = runtimeState.listGatewayEvents(host.id, threadId, 0, 200).concat(controller.buffer)
      const history = { thread: { ...thread, turns: thread.turns ?? [] } }
      const turnsPage = {
        nextCursor: null,
        backwardsCursor: null,
      }
      controller.setOpenSnapshot({
        thread,
        history,
        projectId,
        turnsPage,
        threadSettings: extractThreadSettings(result),
        tokenUsage: latestTokenUsageFromEvents(recentEvents),
      })
      return {
        thread,
        history,
        threadSettings: extractThreadSettings(result),
        tokenUsage: latestTokenUsageFromEvents(recentEvents),
        turnsPage,
        recentEvents,
      }
    } catch (error) {
      throw error
    }
  }

  async startTurn(host: HostRecord, threadId: string, input: TurnStartInput) {
    const controller = await this.getController(host, threadId)
    await controller.ensureSubscribed()
    await controller.ensureConnected()
    const clientUserMessageId = input.clientUserMessageId || `gateway-${randomUUID()}`
    return controller.enqueue(() => controller.client.request<any>('turn/start', {
      threadId,
      clientUserMessageId,
      input: buildUserInput(input),
      cwd: input.cwd || null,
      model: input.model || null,
      effort: input.effort || null,
      approvalPolicy: input.approvalPolicy || null,
    }))
  }

  async steerTurn(host: HostRecord, threadId: string, input: TurnSteerInput) {
    const controller = await this.getController(host, threadId)
    await controller.ensureSubscribed()
    await controller.ensureConnected()
    const clientUserMessageId = input.clientUserMessageId || `gateway-steer-${randomUUID()}`
    return controller.enqueue(() => controller.client.request<{ turnId?: string }>('turn/steer', {
      threadId,
      expectedTurnId: input.expectedTurnId,
      clientUserMessageId,
      input: buildUserInput(input),
    }))
  }

  async respondToServerRequest(host: HostRecord, threadId: string, input: ServerRequestResponseInput) {
    const controller = await this.getController(host, threadId)
    await controller.ensureConnected()
    if (input.error) {
      controller.client.respondError(input.requestId, input.error.code, input.error.message, input.error.data)
    } else {
      controller.client.respond(input.requestId, input.result ?? {})
    }
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
    const client = await this.getHostClient(host)
    return client.request('thread/list', params)
  }

  async listModels(host: HostRecord, params: Record<string, unknown>) {
    const client = await this.getHostClient(host)
    return client.request('model/list', params)
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
      const client = await this.getHostClient(host)
      controller = new ThreadController(host, threadId, client, true, false, false, () => {
        if (this.controllers.get(key) === controller) {
          this.controllers.delete(key)
        }
      })
      this.controllers.set(key, controller)
    }
    await controller.ensureConnected()
    return controller
  }

  async getHostClient(host: HostRecord) {
    let session = this.hostSessions.get(host.id)
    if (!session) {
      session = new HostRpcSession(
        host,
        (hostId, threadId) => this.controllers.get(this.key(hostId, threadId)) ?? null,
        (hostId) => this.controllersForHost(hostId),
        () => this.disposeHostSession(host.id, session),
      )
      this.hostSessions.set(host.id, session)
    }
    return session.connect()
  }

  controllersForHost(hostId: number) {
    return Array.from(this.controllers.values()).filter((controller) => controller.host.id === hostId)
  }

  async subscribe(host: HostRecord, threadId: string, callback: Subscriber, onClose?: CloseSubscriber) {
    const controller = await this.getController(host, threadId)
    if (!controller.isSubscribed()) {
      await controller.ensureSubscribed()
    }
    return controller.subscribe(callback, onClose)
  }

  close(hostId: number, threadId: string) {
    const key = this.key(hostId, threadId)
    this.controllers.get(key)?.close()
    this.controllers.delete(key)
  }

  closeHost(hostId: number) {
    for (const controller of this.controllersForHost(hostId)) {
      controller.close()
      this.controllers.delete(this.key(hostId, controller.threadId))
    }
    const session = this.hostSessions.get(hostId)
    this.hostSessions.delete(hostId)
    session?.close()
  }

  private disposeHostSession(hostId: number, session: HostRpcSession) {
    if (this.hostSessions.get(hostId) === session) {
      this.hostSessions.delete(hostId)
    }
    for (const controller of this.controllersForHost(hostId)) {
      controller.disposeAfterTransportClose()
      this.controllers.delete(this.key(hostId, controller.threadId))
    }
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

function threadIdFromNotification(message: any) {
  const params = message?.params
  return params?.threadId
    ? String(params.threadId)
    : params?.thread?.id
      ? String(params.thread.id)
    : params?.turn?.threadId
      ? String(params.turn.threadId)
      : params?.item?.threadId
        ? String(params.item.threadId)
        : null
}
