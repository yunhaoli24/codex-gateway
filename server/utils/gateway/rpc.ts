import { EventEmitter } from 'node:events'
import { createInterface, type Interface } from 'node:readline'
import type { Readable } from 'node:stream'
import type { ClientChannel } from 'ssh2'
import WebSocket from 'ws'
import type { HostRecord, RpcEnvelope } from '~~/shared/types'
import { hostManager } from './ssh'
import { codexRemotePayload, remoteLoginShellCommand } from './remote-command'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
  timer: NodeJS.Timeout
}

interface StreamTransport {
  write: (payload: string) => void
  close: () => void
}

export type RpcNotificationHandler = (message: RpcEnvelope) => void

export class CodexRpcClient extends EventEmitter {
  private nextId = 1
  private initialized = false
  private pending = new Map<number, PendingRequest>()
  private transport: StreamTransport | null = null
  private rl: Interface | null = null
  private ws: WebSocket | null = null
  private stderrBuffer = ''

  constructor(private readonly host: HostRecord) {
    super()
  }

  async connect() {
    if (this.initialized) {
      return
    }

    if (this.host.appServerMode === 'websocket') {
      await this.connectWebSocket()
    } else {
      await this.connectStdio()
    }

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
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Codex RPC client closed'))
    }
    this.pending.clear()
    this.rl?.close()
    this.transport?.close()
    this.ws?.close()
  }

  private async connectStdio() {
    if (this.host.appServerMode === 'local') {
      await this.connectLocalStdio()
      return
    }

    const client = await hostManager.connect(this.host)
    const channel = await new Promise<ClientChannel>((resolve, reject) => {
      client.exec(remoteLoginShellCommand(codexRemotePayload('codex app-server --stdio')), (error, channel) => {
        if (error) {
          reject(error)
          return
        }
        resolve(channel)
      })
    })

    this.transport = {
      write: (payload) => channel.write(payload),
      close: () => channel.close(),
    }

    channel.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      this.stderrBuffer = `${this.stderrBuffer}${text}`.slice(-4000)
      this.emit('stderr', text)
    })
    channel.on('close', (code: number | null, signal: string | null) => {
      this.emit('close', { code, signal })
      this.rejectPending(new Error(this.closedMessage(code, signal)))
    })

    this.rl = createInterface({ input: channel })
    this.rl.on('line', (line) => this.handleLine(line))
  }

  private async connectLocalStdio() {
    const { spawn } = await import('node:child_process')
    const proc = spawn('codex', ['app-server', '--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.transport = {
      write: (payload) => proc.stdin.write(payload),
      close: () => proc.kill(),
    }

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8')
      this.stderrBuffer = `${this.stderrBuffer}${text}`.slice(-4000)
      this.emit('stderr', text)
    })
    proc.on('exit', (code, signal) => {
      this.emit('close', { code, signal })
      this.rejectPending(new Error(this.closedMessage(code, signal)))
    })

    this.rl = createInterface({ input: proc.stdout as Readable })
    this.rl.on('line', (line) => this.handleLine(line))
  }

  private connectWebSocket() {
    return new Promise<void>((resolve, reject) => {
      if (!this.host.appServerUrl) {
        reject(new Error('WebSocket app-server URL is required for this host'))
        return
      }

      this.ws = new WebSocket(this.host.appServerUrl)
      this.ws.on('open', () => resolve())
      this.ws.on('message', (data) => this.handleLine(data.toString()))
      this.ws.on('error', reject)
      this.ws.on('close', () => {
        this.emit('close', { code: null, signal: null })
        this.rejectPending(new Error('Codex RPC WebSocket closed'))
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
    const payload = `${JSON.stringify(message)}\n`
    if (this.ws) {
      this.ws.send(JSON.stringify(message))
      return
    }
    if (!this.transport) {
      throw new Error('Codex RPC transport is not connected')
    }
    this.transport.write(payload)
  }

  private handleLine(line: string) {
    if (!line.trim()) {
      return
    }

    let message: RpcEnvelope
    try {
      message = JSON.parse(line)
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
