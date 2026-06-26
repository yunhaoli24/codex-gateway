import { EventEmitter } from 'node:events'
import WebSocket from 'ws'
import type { HostRecord, RpcEnvelope } from '~~/shared/types'
import { hostManager } from './ssh'
import { codexRemoteAppServerProxyPayload, remoteLoginShellCommand } from './remote-command'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
  timer: NodeJS.Timeout
}

export type RpcNotificationHandler = (message: RpcEnvelope) => void

export class CodexRpcClient extends EventEmitter {
  private nextId = 1
  private initialized = false
  private connectPromise: Promise<void> | null = null
  private pending = new Map<number, PendingRequest>()
  private ws: WebSocket | null = null
  private stderrBuffer = ''

  constructor(private readonly host: HostRecord) {
    super()
  }

  async connect() {
    if (this.initialized) {
      return
    }
    if (this.connectPromise) {
      return this.connectPromise
    }

    this.connectPromise = this.doConnect().finally(() => {
      this.connectPromise = null
    })
    return this.connectPromise
  }

  private async doConnect() {
    if (this.initialized) {
      return
    }

    await this.connectRemoteProxyWebSocket()

    await this.request('initialize', {
      clientInfo: {
        name: 'codex_gateway',
        title: 'Codex Gateway',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: true,
      },
    }, 30_000)
    this.notify('initialized', {})
    this.initialized = true
  }

  request<T = unknown>(method: string, params: unknown = {}, timeoutMs = 120_000): Promise<T> {
    const id = this.nextId++
    const message = { id, method, params }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Codex RPC request timed out: ${method}`))
      }, timeoutMs)

      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      })

      this.send(message)
    })
  }

  notify(method: string, params: unknown) {
    this.send({ method, params })
  }

  close() {
    this.initialized = false
    this.connectPromise = null
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Codex RPC client closed'))
    }
    this.pending.clear()
    this.ws?.close()
  }

  private async connectRemoteProxyWebSocket() {
    const channel = await hostManager.execChannel(
      this.host,
      remoteLoginShellCommand(codexRemoteAppServerProxyPayload()),
    )

    channel.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      this.stderrBuffer = `${this.stderrBuffer}${text}`.slice(-4000)
      this.emit('stderr', text)
    })
    channel.on('close', (code: number | null, signal: string | null) => {
      this.emit('close', { code, signal })
      this.rejectPending(new Error(this.closedMessage(code, signal)))
    })

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket('ws://localhost/rpc', {
        createConnection: () => channel,
        perMessageDeflate: false,
      })
      this.ws = ws
      ws.on('open', () => resolve())
      ws.on('message', (data) => this.handleMessage(data.toString()))
      ws.on('error', reject)
      ws.on('close', () => {
        this.emit('close', { code: null, signal: null })
        this.rejectPending(new Error('Codex RPC remote proxy WebSocket closed'))
      })
    })
  }

  private rejectPending(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }

  private closedMessage(code: number | null, signal: string | null) {
    const detail = [
      code == null ? null : `code ${code}`,
      signal ? `signal ${signal}` : null,
      this.stderrBuffer.trim() ? `stderr: ${this.stderrBuffer.trim()}` : null,
    ].filter(Boolean).join(', ')
    return detail ? `Codex RPC transport closed (${detail})` : 'Codex RPC transport closed'
  }

  private send(message: RpcEnvelope) {
    if (!this.ws) {
      throw new Error('Codex RPC transport is not connected')
    }
    if (this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Codex RPC transport is not open: readyState ${this.ws.readyState}`)
    }
    this.ws.send(JSON.stringify(message))
  }

  private handleMessage(payload: string) {
    if (!payload.trim()) {
      return
    }

    let message: RpcEnvelope
    try {
      message = JSON.parse(payload)
    } catch (error) {
      this.emit('protocolError', error)
      return
    }

    if (message.id !== undefined) {
      const id = Number(message.id)
      const pending = this.pending.get(id)
      if (!pending) {
        return
      }

      clearTimeout(pending.timer)
      this.pending.delete(id)
      if (message.error) {
        pending.reject(new Error(message.error.message))
      } else {
        pending.resolve(message.result)
      }
      return
    }

    this.emit('notification', message)
  }
}
