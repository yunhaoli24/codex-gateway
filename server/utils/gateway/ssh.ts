import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Client, type ClientChannel } from 'ssh2'
import { SocksClient } from 'socks'
import type { HostRecord } from '~~/shared/types'
import {
  codexRemoteAppServerDaemonVersionPayload,
  codexRemoteStopManagedAppServerPayload,
  codexRemoteTerminateUnmanagedAppServerPayload,
  codexRemoteAppServerVerifyPayload,
  codexRemoteUpgradeAndRestartPayload,
  codexRemoteVersionPayload,
  remoteLoginShellCommand,
} from './remote-command'
import { isCodexVersionAtLeast, latestCodexCliVersion, parseCodexVersion } from './codex-version'
import { hostLifecycleBus } from './host-events'

type HostWithSecret = HostRecord

export interface CommandResult {
  code: number | null
  stdout: string
  stderr: string
}

export interface RemoteFileResult {
  path: string
  size: number
  data: Buffer
}

export interface RemoteCodexVersionState {
  version: string
  appServerVersion: string | null
  latestVersion: string
  beforeVersion: string
  upgraded: boolean
}

export class HostManager {
  private clients = new Map<string, Promise<Client>>()
  private hostKeys = new Map<number, string>()
  private versionChecks = new Map<number, Promise<RemoteCodexVersionState>>()

  connect(host: HostWithSecret): Promise<Client> {
    const resolved = resolveSshConfig(host)
    const key = sshConnectionKey(host, resolved)
    this.hostKeys.set(host.id, key)

    const existing = this.clients.get(key)
    if (existing) {
      return existing
    }

    const promise = (async () => {
      const sock = resolved.proxy
        ? await createProxySocket({
            proxy: resolved.proxy,
            targetHost: resolved.hostName,
            targetPort: host.port ?? resolved.port,
          })
        : undefined
      const client = new Client()
      return await new Promise<Client>((resolve, reject) => {
        client
          .on('ready', () => resolve(client))
          .on('error', (error) => {
            this.clients.delete(key)
            reject(error)
          })
          .on('end', () => this.clients.delete(key))
          .on('close', () => this.clients.delete(key))
          .connect({
            host: sock ? undefined : resolved.hostName,
            sock,
            username: host.username ?? resolved.username,
            port: sock ? undefined : host.port ?? resolved.port,
            agent: host.authMode === 'agent' ? process.env.SSH_AUTH_SOCK : undefined,
            password: host.authMode === 'password' ? host.password ?? undefined : undefined,
            privateKey: host.privateKey
              ? Buffer.from(host.privateKey)
              : resolved.privateKeyPath
              ? readFileSync(expandHome(resolved.privateKeyPath))
              : undefined,
            readyTimeout: 15_000,
            keepaliveInterval: 15_000,
            keepaliveCountMax: 3,
          })
      })
    })().catch((error) => {
      this.clients.delete(key)
      throw error
    })

    this.clients.set(key, promise)
    return promise
  }

  async exec(host: HostWithSecret, command: string): Promise<CommandResult> {
    const channel = await this.execChannel(host, command)

    return new Promise((resolve, reject) => {
      let stdout = ''
      let stderr = ''
      channel.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8')
      })
      channel.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8')
      })
      channel.on('error', reject)
      channel.on('close', (code: number | null) => {
        resolve({ code, stdout, stderr })
      })
    })
  }

  async execChannel(host: HostWithSecret, command: string, retried = false): Promise<ClientChannel> {
    const client = await this.connect(host)

    return new Promise((resolve, reject) => {
      client.exec(command, (error, channel) => {
        if (error) {
          this.disconnectHost(host)
          if (!retried && isConnectionLevelSshError(error)) {
            void this.execChannel(host, command, true).then(resolve, reject)
            return
          }
          reject(error)
          return
        }
        resolve(channel)
      })
    })
  }

  async verify(host: HostWithSecret) {
    const versionState = await this.ensureCodexVersion(host)
    const probe = await this.exec(host, remoteLoginShellCommand(codexRemoteAppServerVerifyPayload()))
    if (probe.code !== 0) {
      return {
        ok: false,
        code: probe.code,
        stdout: probe.stdout.trim(),
        stderr: probe.stderr.trim(),
      }
    }

    const { CodexRpcClient } = await import('./rpc')
    const client = new CodexRpcClient(host)
    try {
      await client.connect()
      const threads = await client.request('thread/list', { limit: 1, useStateDbOnly: true }, 30_000)
      return {
        ok: true,
        code: 0,
        stdout: [
          versionState.upgraded ? `Upgraded Codex ${versionState.beforeVersion} -> ${versionState.version}` : null,
          probe.stdout.trim(),
          'app-server RPC OK',
        ]
          .filter(Boolean)
          .join('\n'),
        stderr: probe.stderr.trim(),
        codexVersion: versionState.version,
        appServerVersion: versionState.appServerVersion,
        latestCodexVersion: versionState.latestVersion,
        upgraded: versionState.upgraded,
        threads,
      }
    } finally {
      client.close()
    }
  }

  async ensureCodexVersion(host: HostWithSecret): Promise<RemoteCodexVersionState> {
    const existing = this.versionChecks.get(host.id)
    if (existing) {
      return existing
    }

    const check = this.checkAndUpgradeCodex(host).finally(() => {
      this.versionChecks.delete(host.id)
    })
    this.versionChecks.set(host.id, check)
    return check
  }

  async checkAndUpgradeCodex(host: HostWithSecret): Promise<RemoteCodexVersionState> {
    try {
      hostLifecycleBus.emit({
        hostId: host.id,
        status: 'checkingVersion',
        message: '正在检查远端 Codex 版本',
      })
      const latestVersion = await latestCodexCliVersion()
      const beforeVersion = await this.readCodexVersion(host)
      const daemonState = await this.readAppServerDaemonState(host)
      const appServerVersion = daemonState.running ? await this.readRunningAppServerVersion(host) : null
      const currentRuntimeVersion = appServerVersion ?? beforeVersion

      if (isCodexVersionAtLeast(beforeVersion, latestVersion) && isCodexVersionAtLeast(currentRuntimeVersion, latestVersion)) {
        hostLifecycleBus.emit({
          hostId: host.id,
          status: 'connecting',
          message: `远端 Codex 已是最新版本 ${beforeVersion}`,
        })
        return {
          version: beforeVersion,
          appServerVersion,
          latestVersion,
          beforeVersion,
          upgraded: false,
        }
      }

      if (daemonState.unmanagedRunning) {
        if (await this.hasActiveLoadedThread(host)) {
          throw new Error(`Remote Codex runtime ${currentRuntimeVersion} is below latest ${latestVersion}, but a loaded thread is active`)
        }
        await this.terminateUnmanagedAppServer(host)
      }

      if (!daemonState.unmanagedRunning && daemonState.running && await this.hasActiveLoadedThread(host)) {
        throw new Error(`Remote Codex runtime ${currentRuntimeVersion} is below latest ${latestVersion}, but a loaded thread is active`)
      }

      if (!daemonState.unmanagedRunning && daemonState.running) {
        await this.stopManagedAppServer(host)
      }

      hostLifecycleBus.emit({
        hostId: host.id,
        status: 'upgrading',
        message: `正在升级远端 Codex ${beforeVersion} -> ${latestVersion}`,
      })
      const version = await this.upgradeCodex(host)
      this.disconnectHost(host)
      if (!isCodexVersionAtLeast(version, latestVersion)) {
        throw new Error(`Remote Codex upgraded to ${version}, still below latest ${latestVersion}`)
      }
      hostLifecycleBus.emit({
        hostId: host.id,
        status: 'restarting',
        message: `远端 Codex 已升级到 ${version}，正在重启 app-server`,
      })
      return {
        version,
        appServerVersion: version,
        latestVersion,
        beforeVersion,
        upgraded: true,
      }
    } catch (error) {
      hostLifecycleBus.emit({
        hostId: host.id,
        status: 'failed',
        message: messageFromError(error),
      })
      throw error
    }
  }

  async listDirectories(host: HostWithSecret, path: string) {
    const normalizedPath = path?.trim() || '.'
    const script = `
const fs = require('fs');
const path = require('path');
const input = process.argv[1] || '.';
const base = path.resolve(input.replace(/^~(?=$|\\/)/, process.env.HOME || '~'));
const entries = fs.readdirSync(base, { withFileTypes: true })
  .filter((entry) => !entry.name.startsWith('.'))
  .map((entry) => ({
    name: entry.name,
    path: path.join(base, entry.name),
    type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
  }))
  .sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
console.log(JSON.stringify({ path: base, entries }));
`
    const command = remoteLoginShellCommand(`node -e ${shellQuote(script)} ${shellQuote(normalizedPath)}`)
    const result = await this.exec(host, command)
    if (result.code !== 0) {
      throw new Error(result.stderr || `Failed to list remote directory: ${normalizedPath}`)
    }
    return JSON.parse(result.stdout) as { path: string, entries: Array<{ name: string, path: string, type: 'directory' | 'file' | 'other' }> }
  }

  async uploadFile(host: HostWithSecret, localPath: string, remotePath: string) {
    const client = await this.connect(host)
    const directory = remotePath.split('/').slice(0, -1).join('/') || '.'
    const mkdir = await this.exec(host, remoteLoginShellCommand(`mkdir -p ${shellQuote(directory)}`))
    if (mkdir.code !== 0) {
      throw new Error(mkdir.stderr || `Failed to create remote upload directory: ${directory}`)
    }

    await new Promise<void>((resolve, reject) => {
      client.sftp((error, sftp) => {
        if (error) {
          reject(error)
          return
        }

        const reader = createReadStream(localPath)
        const writer = sftp.createWriteStream(remotePath, { mode: 0o600 })
        const cleanup = () => {
          sftp.end()
        }
        reader.on('error', (streamError) => {
          cleanup()
          reject(streamError)
        })
        writer.on('error', (streamError) => {
          cleanup()
          reject(streamError)
        })
        writer.on('close', () => {
          cleanup()
          resolve()
        })
        reader.pipe(writer)
      })
    })

    return remotePath
  }

  async readRemoteFile(host: HostWithSecret, remotePath: string, options: { maxSize: number }): Promise<RemoteFileResult> {
    const path = remotePath.trim()
    if (!path.startsWith('/')) {
      throw new Error('Remote file path must be absolute')
    }

    const client = await this.connect(host)
    return new Promise<RemoteFileResult>((resolve, reject) => {
      client.sftp((error, sftp) => {
        if (error) {
          reject(error)
          return
        }

        const cleanup = () => {
          sftp.end()
        }

        sftp.stat(path, (statError, stats) => {
          if (statError) {
            cleanup()
            reject(statError)
            return
          }
          if (!stats.isFile()) {
            cleanup()
            reject(new Error('Remote path is not a file'))
            return
          }
          if (stats.size > options.maxSize) {
            cleanup()
            reject(new Error(`Remote file exceeds ${options.maxSize} bytes`))
            return
          }

          sftp.readFile(path, (readError, data) => {
            cleanup()
            if (readError) {
              reject(readError)
              return
            }
            resolve({ path, size: stats.size, data })
          })
        })
      })
    })
  }

  async createUploadDirectory(host: HostWithSecret) {
    const script = 'root="${TMPDIR:-/tmp}/codex-gateway-uploads"; mkdir -p "$root"; mktemp -d "$root/upload.XXXXXXXXXX"'
    const result = await this.exec(host, remoteLoginShellCommand(script))
    if (result.code !== 0) {
      throw new Error(result.stderr || 'Failed to create remote upload directory')
    }
    return result.stdout.trim()
  }

  syncHosts(hosts: HostWithSecret[]) {
    const activeKeys = new Set<string>()
    this.hostKeys.clear()
    for (const host of hosts) {
      const key = sshConnectionKey(host, resolveSshConfig(host))
      activeKeys.add(key)
      this.hostKeys.set(host.id, key)
    }

    for (const [key, client] of this.clients) {
      if (!activeKeys.has(key)) {
        this.clients.delete(key)
        void client.then((connection) => connection.end()).catch(() => {})
      }
    }
  }

  disconnectHost(host: HostWithSecret) {
    const key = this.hostKeys.get(host.id) ?? sshConnectionKey(host, resolveSshConfig(host))
    this.disconnectKey(key)
  }

  disconnect(hostId: number) {
    const key = this.hostKeys.get(hostId)
    if (key) {
      this.disconnectKey(key)
      this.hostKeys.delete(hostId)
    }
  }

  clearVersionCheck(hostId: number) {
    this.versionChecks.delete(hostId)
  }

  private async readCodexVersion(host: HostWithSecret) {
    const result = await this.exec(host, remoteLoginShellCommand(codexRemoteVersionPayload()))
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || 'Failed to read remote Codex version')
    }
    const parsed = parseCodexVersion(result.stdout)
    if (!parsed) {
      throw new Error(`Unable to parse remote Codex version: ${result.stdout.trim()}`)
    }
    return parsed.version
  }

  private async upgradeCodex(host: HostWithSecret) {
    const result = await this.exec(host, remoteLoginShellCommand(codexRemoteUpgradeAndRestartPayload()))
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || 'Failed to upgrade remote Codex')
    }
    const parsed = parseCodexVersion(result.stdout)
    if (!parsed) {
      throw new Error(`Unable to parse upgraded remote Codex version: ${result.stdout.trim()}`)
    }
    return parsed.version
  }

  private async terminateUnmanagedAppServer(host: HostWithSecret) {
    hostLifecycleBus.emit({
      hostId: host.id,
      status: 'restarting',
      message: '正在停止旧的远端 Codex app-server',
    })
    const result = await this.exec(host, remoteLoginShellCommand(codexRemoteTerminateUnmanagedAppServerPayload()))
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || 'Failed to terminate unmanaged remote Codex app-server')
    }
    this.disconnectHost(host)
  }

  private async stopManagedAppServer(host: HostWithSecret) {
    hostLifecycleBus.emit({
      hostId: host.id,
      status: 'restarting',
      message: '正在停止远端 Codex app-server',
    })
    const result = await this.exec(host, remoteLoginShellCommand(codexRemoteStopManagedAppServerPayload()))
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || 'Failed to stop managed remote Codex app-server')
    }
    this.disconnectHost(host)
  }

  private async readAppServerDaemonState(host: HostWithSecret) {
    const result = await this.exec(host, remoteLoginShellCommand(codexRemoteAppServerDaemonVersionPayload()))
    const combined = `${result.stdout}\n${result.stderr}`
    if (/app server is running but is not managed by codex app-server daemon/i.test(combined)) {
      return {
        running: true,
        unmanagedRunning: true,
        appServerVersion: parseDaemonAppServerVersion(result.stdout),
        raw: combined.trim(),
      }
    }
    if (result.code === 0) {
      return {
        running: true,
        unmanagedRunning: false,
        appServerVersion: parseDaemonAppServerVersion(result.stdout),
        raw: combined.trim(),
      }
    }
    return {
      running: false,
      unmanagedRunning: false,
      appServerVersion: null,
      raw: combined.trim(),
    }
  }

  private async readRunningAppServerVersion(host: HostWithSecret) {
    const { CodexRpcClient } = await import('./rpc')
    const client = new CodexRpcClient(host, { skipVersionCheck: true, skipDaemonStart: true })
    const userAgent = await client.probeRuntimeVersion()
    if (!userAgent) {
      return null
    }
    const parsed = parseCodexVersion(userAgent)
    if (!parsed) {
      throw new Error(`Unable to parse remote app-server version: ${userAgent}`)
    }
    return parsed.version
  }

  private async hasActiveLoadedThread(host: HostWithSecret) {
    const { CodexRpcClient } = await import('./rpc')
    const client = new CodexRpcClient(host, { skipVersionCheck: true, skipDaemonStart: true })
    try {
      await client.connect()
      const loaded = await client.request<{ data?: string[], nextCursor?: string | null }>('thread/loaded/list', {}, 30_000)
      for (const threadId of loaded.data ?? []) {
        const read = await client.request<any>('thread/read', { threadId, includeTurns: false }, 30_000)
        if (isActiveThreadStatus(read?.thread?.status ?? read?.status)) {
          return true
        }
      }
      return false
    } finally {
      client.close()
    }
  }

  private disconnectKey(key: string) {
    const client = this.clients.get(key)
    this.clients.delete(key)
    void client?.then((connection) => connection.end()).catch(() => {})
  }
}

export const hostManager = new HostManager()

function expandHome(path: string) {
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path
}

function resolveSshConfig(host: HostWithSecret) {
  const configPath = join(homedir(), '.ssh', 'config')
  const result = {
    hostName: host.sshHost,
    username: host.username ?? undefined,
    port: host.port ?? 22,
    privateKeyPath: host.authMode === 'privateKey' ? host.privateKeyPath ?? undefined : undefined,
    proxy: parseProxyUrl(host.proxyUrl),
  }

  if (!existsSync(configPath)) {
    return result
  }

  const lines = readFileSync(configPath, 'utf8').split(/\r?\n/)
  let active = false

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+#.*$/, '').trim()
    if (!line) {
      continue
    }

    const [keywordRaw, ...valueParts] = line.split(/\s+/)
    const keyword = keywordRaw?.toLowerCase()
    const value = valueParts.join(' ')

    if (keyword === 'host') {
      const patterns = valueParts
      active = patterns.some((pattern) => hostPatternMatches(pattern, host.sshHost))
      continue
    }

    if (!active || !value) {
      continue
    }

    if (keyword === 'hostname') {
      result.hostName = value
    } else if (keyword === 'user' && !host.username) {
      result.username = value
    } else if (keyword === 'port' && host.port == null) {
      result.port = Number(value) || result.port
    } else if (keyword === 'identityfile' && host.authMode === 'privateKey' && !host.privateKeyPath) {
      result.privateKeyPath = value
    }
  }

  return result
}

function sshConnectionKey(host: HostWithSecret, resolved: ReturnType<typeof resolveSshConfig>) {
  const secretFingerprint = createHash('sha256')
    .update(host.authMode)
    .update('\0')
    .update(host.authMode === 'password' ? host.password ?? '' : '')
    .update('\0')
    .update(host.privateKey ?? '')
    .update('\0')
    .update(resolved.privateKeyPath ?? '')
    .digest('hex')

  return [
    resolved.hostName,
    host.username ?? resolved.username ?? '',
    host.port ?? resolved.port,
    resolved.proxy?.raw ?? '',
    host.authMode,
    secretFingerprint,
  ].join('|')
}

function parseProxyUrl(proxyUrl?: string | null) {
  const raw = proxyUrl?.trim()
  if (!raw) {
    return null
  }
  const url = new URL(raw)
  if (url.protocol !== 'socks5:' && url.protocol !== 'socks5h:') {
    throw new Error(`Unsupported SSH proxy protocol: ${url.protocol}`)
  }
  const port = Number(url.port)
  if (!url.hostname || !Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid SSH proxy URL: ${raw}`)
  }
  return {
    raw,
    host: url.hostname,
    port,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  }
}

async function createProxySocket(options: {
  proxy: NonNullable<ReturnType<typeof parseProxyUrl>>
  targetHost: string
  targetPort: number
}) {
  const { socket } = await SocksClient.createConnection({
    command: 'connect',
    timeout: 10_000,
    proxy: {
      host: options.proxy.host,
      port: options.proxy.port,
      type: 5,
      userId: options.proxy.username || undefined,
      password: options.proxy.password || undefined,
    },
    destination: {
      host: options.targetHost,
      port: options.targetPort,
    },
  })
  return socket
}

function hostPatternMatches(pattern: string, host: string) {
  if (pattern.startsWith('!')) {
    return false
  }
  const expression = `^${pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replaceAll('*', '.*')
    .replaceAll('?', '.')}$`
  return new RegExp(expression).test(host)
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function isConnectionLevelSshError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /No response from server|Not connected|Connection lost|Channel open failure|ECONNRESET|EPIPE/i.test(message)
}

function isActiveThreadStatus(status: any) {
  return status === 'active' || status?.type === 'active'
}

function parseDaemonAppServerVersion(output: string) {
  try {
    const parsed = JSON.parse(output.trim())
    return typeof parsed.appServerVersion === 'string' ? parsed.appServerVersion : null
  } catch {
    return null
  }
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
