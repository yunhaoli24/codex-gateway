import type {
  GatewayEvent,
  GatewayConfig,
  HostCreateInput,
  HostRecord,
  ProjectCreateInput,
  ProjectRecord,
} from '~~/shared/types'

type HostWithSecret = HostRecord

interface RuntimeState {
  hosts: HostWithSecret[]
  projects: ProjectRecord[]
  lastOpenThread: GatewayConfig['lastOpenThread']
  threadMetadata: Array<{
    hostId: number
    projectId: number | null
    threadId: string
    name: string | null
    preview: string | null
    cwd: string | null
    status: unknown
    recencyAt: number | null
    updatedAt: number
  }>
  events: GatewayEvent[]
  nextEventId: number
}

const state: RuntimeState = {
  hosts: [],
  projects: [],
  lastOpenThread: null,
  threadMetadata: [],
  events: [],
  nextEventId: 1,
}

function nowIso() {
  return new Date().toISOString()
}

function nextId(records: Array<{ id: number }>) {
  return records.reduce((max, record) => Math.max(max, record.id), 0) + 1
}

function sanitizeHost(host: HostWithSecret): HostRecord {
  return {
    ...host,
    hasPassword: Boolean(host.password),
  }
}

function normalizeHost(input: HostCreateInput, id = nextId(state.hosts)): HostWithSecret {
  const timestamp = nowIso()
  const existing = state.hosts.find((host) => host.id === id)
  return {
    id,
    name: input.name.trim(),
    sshHost: input.sshHost.trim(),
    username: input.username?.trim() || null,
    port: input.port || null,
    authMode: input.authMode,
    privateKeyPath: input.privateKeyPath?.trim() || null,
    privateKey: input.privateKey || null,
    password: input.authMode === 'password' ? input.password || null : input.password || null,
    hasPassword: Boolean(input.password),
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  }
}

function normalizeProject(input: ProjectCreateInput, id = nextId(state.projects)): ProjectRecord {
  const timestamp = nowIso()
  const existing = state.projects.find((project) => project.id === id)
  return {
    id,
    hostId: input.hostId,
    name: input.name.trim(),
    remotePath: input.remotePath.trim(),
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  }
}

export const persistence = {
  replaceConfig(config: GatewayConfig) {
    const hostIds = new Set(config.hosts.map((host) => host.id))
    state.hosts = config.hosts.map((host) => ({
      ...host,
      hasPassword: Boolean(host.password),
    }))
    state.projects = state.projects.filter((project) => hostIds.has(project.hostId))
    state.lastOpenThread = config.lastOpenThread ?? null
    state.threadMetadata = state.threadMetadata.filter((thread) => hostIds.has(thread.hostId))
    state.events = state.events.filter((event) => hostIds.has(event.hostId))
  },

  exportConfig(): GatewayConfig {
    return {
      version: 1,
      hosts: state.hosts.map((host) => ({ ...host, hasPassword: Boolean(host.password) })),
      pinnedThreads: [],
      lastOpenThread: state.lastOpenThread ?? null,
    }
  },

  listHosts(): HostRecord[] {
    return state.hosts
      .map(sanitizeHost)
      .sort((left, right) => left.name.localeCompare(right.name))
  },

  getHost(id: number): HostRecord | null {
    const host = state.hosts.find((item) => item.id === id)
    return host ? sanitizeHost(host) : null
  },

  getHostWithSecret(id: number): HostWithSecret | null {
    return state.hosts.find((item) => item.id === id) ?? null
  },

  createHost(input: HostCreateInput): HostRecord {
    const host = normalizeHost(input)
    state.hosts.push(host)
    return sanitizeHost(host)
  },

  deleteHost(id: number) {
    state.hosts = state.hosts.filter((host) => host.id !== id)
    state.projects = state.projects.filter((project) => project.hostId !== id)
    state.threadMetadata = state.threadMetadata.filter((thread) => thread.hostId !== id)
    state.events = state.events.filter((event) => event.hostId !== id)
  },

  listProjects(hostId?: number): ProjectRecord[] {
    return state.projects
      .filter((project) => !hostId || project.hostId === hostId)
      .sort((left, right) => left.name.localeCompare(right.name))
  },

  getProject(id: number): ProjectRecord | null {
    return state.projects.find((project) => project.id === id) ?? null
  },

  createProject(input: ProjectCreateInput): ProjectRecord {
    const remotePath = input.remotePath.trim()
    const existing = state.projects.find((project) => project.hostId === input.hostId && project.remotePath === remotePath)
    const project = normalizeProject(input, existing?.id)
    if (existing) {
      state.projects = state.projects.map((item) => item.id === existing.id ? project : item)
    } else {
      state.projects.push(project)
    }
    return project
  },

  ensureProjectForPath(hostId: number, remotePath: string): ProjectRecord {
    const normalizedPath = remotePath.trim()
    const existing = state.projects.find((project) => project.hostId === hostId && project.remotePath === normalizedPath)
    if (existing) {
      return existing
    }
    const name = normalizedPath.split('/').filter(Boolean).at(-1) || normalizedPath || 'root'
    return this.createProject({
      hostId,
      name,
      remotePath: normalizedPath,
    })
  },

  recordThread(hostId: number, projectId: number | null, thread: any) {
    const threadId = String(thread.id)
    const timestamp = Math.floor(Date.now() / 1000)
    const metadata = {
      hostId,
      projectId,
      threadId,
      name: thread.name ?? null,
      preview: thread.preview ?? thread.name ?? null,
      cwd: thread.cwd ?? null,
      status: thread.status ?? null,
      recencyAt: toTimestamp(thread.recencyAt ?? thread.updatedAt ?? thread.createdAt) ?? timestamp,
      updatedAt: toTimestamp(thread.updatedAt ?? thread.recencyAt ?? thread.createdAt) ?? timestamp,
    }
    const index = state.threadMetadata.findIndex((item) => item.hostId === hostId && item.threadId === threadId)
    if (index >= 0) {
      state.threadMetadata[index] = {
        ...state.threadMetadata[index],
        ...metadata,
        projectId: projectId ?? state.threadMetadata[index].projectId,
        cwd: metadata.cwd ?? state.threadMetadata[index].cwd,
        preview: metadata.preview ?? state.threadMetadata[index].preview,
        name: metadata.name ?? state.threadMetadata[index].name,
        status: metadata.status ?? state.threadMetadata[index].status,
      }
    } else {
      state.threadMetadata.push(metadata)
    }
  },

  listThreadMetadata(hostId: number, options: { projectId?: number | null, cwd?: string | null } = {}) {
    return state.threadMetadata
      .filter((thread) => {
        if (thread.hostId !== hostId) {
          return false
        }
        if (options.projectId != null && thread.projectId !== options.projectId) {
          return false
        }
        if (options.cwd && thread.cwd && thread.cwd !== options.cwd) {
          return false
        }
        return true
      })
      .map((thread) => ({
        id: thread.threadId,
        name: thread.name,
        preview: thread.preview,
        cwd: thread.cwd,
        status: thread.status,
        recencyAt: thread.recencyAt,
        updatedAt: thread.updatedAt,
      }))
      .sort((left, right) => Number(right.recencyAt || right.updatedAt || 0) - Number(left.recencyAt || left.updatedAt || 0))
  },

  addGatewayEvent(hostId: number, threadId: string, method: string, payload: unknown): GatewayEvent {
    const event = {
      id: state.nextEventId++,
      hostId,
      threadId,
      method,
      payload: payload as GatewayEvent['payload'],
      createdAt: nowIso(),
    }
    state.events.push(event)
    this.pruneGatewayEvents(hostId, threadId, 500)
    return event
  },

  listGatewayEvents(hostId: number, threadId: string, afterId = 0, limit = 200): GatewayEvent[] {
    return state.events
      .filter((event) => event.hostId === hostId && event.threadId === threadId && event.id > afterId)
      .sort((left, right) => left.id - right.id)
      .slice(0, limit)
  },

  pruneGatewayEvents(hostId: number, threadId: string, keep: number) {
    const retained = state.events
      .filter((event) => event.hostId === hostId && event.threadId === threadId)
      .sort((left, right) => right.id - left.id)
      .slice(0, keep)
      .map((event) => event.id)
    const retainedIds = new Set(retained)
    state.events = state.events.filter((event) => event.hostId !== hostId || event.threadId !== threadId || retainedIds.has(event.id))
  },

  counts() {
    return {
      hosts: state.hosts.length,
      projects: state.projects.length,
    }
  },
}

function toTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value)
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null
  }
  return null
}
