import type { GatewayEvent, HostRecord } from '~~/shared/types'
import { persistence } from './db'
import { CodexRpcClient } from './rpc'

type Subscriber = (event: GatewayEvent) => void

class ThreadController {
  readonly client: CodexRpcClient
  readonly subscribers = new Set<Subscriber>()
  readonly buffer: GatewayEvent[] = []
  private idleTimer: NodeJS.Timeout | null = null
  private operationQueue: Promise<unknown> = Promise.resolve()
  private connected = false
  private closed = false

  constructor(
    readonly host: HostRecord,
    readonly threadId: string,
    client?: CodexRpcClient,
    connected = false,
    private readonly onClose?: () => void,
  ) {
    this.client = client ?? new CodexRpcClient(host)
    this.connected = connected
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

  enqueue<T>(operation: () => Promise<T>) {
    const run = this.operationQueue.then(operation, operation)
    this.operationQueue = run.catch(() => {})
    return run
  }

  subscribe(callback: Subscriber) {
    this.cancelIdleClose()
    this.subscribers.add(callback)
    return () => {
      this.subscribers.delete(callback)
      this.scheduleIdleClose()
    }
  }

  close() {
    if (this.closed) {
      return
    }
    this.closed = true
    this.cancelIdleClose()
    if (this.connected) {
      void this.client.request('thread/unsubscribe', { threadId: this.threadId }, 5_000).catch(() => {})
    }
    this.client.close()
    this.subscribers.clear()
    this.onClose?.()
  }

  scheduleIdleClose() {
    if (this.subscribers.size > 0 || this.idleTimer) {
      return
    }
    this.idleTimer = setTimeout(() => this.close(), 10 * 60_000)
    this.idleTimer.unref()
  }

  private cancelIdleClose() {
    if (!this.idleTimer) {
      return
    }
    clearTimeout(this.idleTimer)
    this.idleTimer = null
  }
}

class ThreadBroker {
  private controllers = new Map<string, ThreadController>()

  async openThread(host: HostRecord, threadId: string, projectId: number | null) {
    const controller = await this.getController(host, threadId)
    const thread = await controller.enqueue(() => controller.client.request<any>('thread/resume', { threadId }))
    persistence.recordThread(host.id, projectId, thread.thread ?? thread)
    const history = await this.readHistoryOrEmpty(controller, thread.thread ?? thread)
    return {
      thread: thread.thread ?? thread,
      history,
      recentEvents: persistence.listGatewayEvents(host.id, threadId, 0, 200),
    }
  }

  async startThread(host: HostRecord, params: Record<string, unknown>, projectId: number | null) {
    const client = new CodexRpcClient(host)
    try {
      await client.connect()
      const result = await client.request<any>('thread/start', params)
      const thread = result.thread ?? result
      persistence.recordThread(host.id, projectId, thread)
      const threadId = String(thread.id)
      const key = this.key(host.id, threadId)
      this.controllers.get(key)?.close()
      const controller = new ThreadController(host, threadId, client, true, () => {
        if (this.controllers.get(key) === controller) {
          this.controllers.delete(key)
        }
      })
      this.controllers.set(key, controller)
      controller.scheduleIdleClose()
      return {
        thread,
        history: { thread: { ...thread, turns: thread.turns ?? [] } },
        recentEvents: persistence.listGatewayEvents(host.id, threadId, 0, 200).concat(controller.buffer),
      }
    } catch (error) {
      client.close()
      throw error
    }
  }

  async startTurn(host: HostRecord, threadId: string, text: string, cwd?: string | null, clientUserMessageId?: string | null) {
    const controller = await this.getController(host, threadId)
    return controller.enqueue(() => controller.client.request('turn/start', {
      threadId,
      clientUserMessageId: clientUserMessageId || undefined,
      input: [{ type: 'text', text, text_elements: [] }],
      cwd: cwd || null,
    }))
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

  async readThread(host: HostRecord, threadId: string) {
    const controller = await this.getController(host, threadId)
    return controller.enqueue(() => controller.client.request('thread/read', { threadId, includeTurns: true }))
  }

  async getController(host: HostRecord, threadId: string) {
    const key = this.key(host.id, threadId)
    let controller = this.controllers.get(key)
    if (!controller) {
      controller = new ThreadController(host, threadId, undefined, false, () => {
        if (this.controllers.get(key) === controller) {
          this.controllers.delete(key)
        }
      })
      this.controllers.set(key, controller)
    }
    await controller.ensureConnected()
    return controller
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

  private async readHistoryOrEmpty(controller: ThreadController, thread: any) {
    try {
      return await controller.enqueue(() => controller.client.request<any>('thread/read', {
        threadId: controller.threadId,
        includeTurns: true,
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('no rollout found')) {
        return { thread: { ...thread, turns: thread.turns ?? [] } }
      }
      throw error
    }
  }
}

export const threadBroker = new ThreadBroker()
