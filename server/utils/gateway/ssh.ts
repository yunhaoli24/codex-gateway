import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Client } from 'ssh2'
import type { HostRecord } from '~~/shared/types'
import { codexRemoteAppServerVerifyPayload, remoteLoginShellCommand } from './remote-command'

type HostWithSecret = HostRecord

export interface CommandResult {
  code: number | null
  stdout: string
  stderr: string
}

export class HostManager {
  private clients = new Map<number, Promise<Client>>()

  connect(host: HostWithSecret): Promise<Client> {
    const existing = this.clients.get(host.id)
    if (existing) {
      return existing
    }

    const resolved = resolveSshConfig(host)
    const promise = new Promise<Client>((resolve, reject) => {
      const client = new Client()
      client
        .on('ready', () => resolve(client))
        .on('error', (error) => {
          this.clients.delete(host.id)
          reject(error)
        })
        .on('close', () => this.clients.delete(host.id))
        .connect({
          host: resolved.hostName,
          username: host.username ?? resolved.username,
          port: host.port ?? resolved.port,
          agent: host.authMode === 'agent' ? process.env.SSH_AUTH_SOCK : undefined,
          password: host.authMode === 'password' ? host.password ?? undefined : undefined,
          privateKey: host.privateKey
            ? Buffer.from(host.privateKey)
            : resolved.privateKeyPath
            ? readFileSync(expandHome(resolved.privateKeyPath))
            : undefined,
          readyTimeout: 15_000,
        })
    })

    this.clients.set(host.id, promise)
    return promise
  }

  async exec(host: HostWithSecret, command: string): Promise<CommandResult> {
    const client = await this.connect(host)

    return new Promise((resolve, reject) => {
      client.exec(command, (error, channel) => {
        if (error) {
          reject(error)
          return
        }

        let stdout = ''
        let stderr = ''
        channel.on('data', (chunk: Buffer) => {
          stdout += chunk.toString('utf8')
        })
        channel.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString('utf8')
        })
        channel.on('close', (code: number | null) => {
          resolve({ code, stdout, stderr })
        })
      })
    })
  }

  async verify(host: HostWithSecret) {
    if (host.appServerMode === 'websocket') {
      const { CodexRpcClient } = await import('./rpc')
      const client = new CodexRpcClient(host)
      try {
        await client.connect()
        const threads = await client.request('thread/list', { limit: 1 }, 30_000)
        return {
          ok: true,
          code: 0,
          stdout: `Connected to ${host.appServerUrl}`,
          stderr: '',
          threads,
        }
      } finally {
        client.close()
      }
    }

    const result = await this.exec(host, remoteLoginShellCommand(codexRemoteAppServerVerifyPayload()))
    return {
      ok: result.code === 0,
      code: result.code,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
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

  disconnect(hostId: number) {
    const client = this.clients.get(hostId)
    this.clients.delete(hostId)
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
