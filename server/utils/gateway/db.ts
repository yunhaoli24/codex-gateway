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
    preview: string | null
    cwd: string | null
    updatedAt: string
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
    appServerMode: input.appServerMode || 'stdio',
    appServerUrl: input.appServerUrl?.trim() || null,
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

function ensureLocalHostRecord() {
  const existing = state.hosts.find((host) => host.appServerMode === 'local')
  if (existing) {
    return existing
  }
  const local = normalizeHost({
    name: '本机 Codex',
    sshHost: 'local',
    username: null,
    port: null,
    authMode: 'agent',
    privateKeyPath: null,
    privateKey: null,
    password: null,
    appServerMode: 'local',
    appServerUrl: null,
  })
  state.hosts.push(local)
  return local
}

export const persistence = {
  replaceConfig(config: GatewayConfig) {
    state.hosts = config.hosts.map((host) => ({
      ...host,
      hasPassword: Boolean(host.password),
    }))
    state.projects = []
    state.lastOpenThread = config.lastOpenThread ?? null
    state.threadMetadata = []
    state.events = []
    state.nextEventId = 1
    ensureLocalHostRecord()
  },

  exportConfig(): GatewayConfig {
    ensureLocalHostRecord()
    return {
      version: 1,
      hosts: state.hosts.map((host) => ({ ...host, hasPassword: Boolean(host.password) })),
      pinnedThreads: [],
      lastOpenThread: state.lastOpenThread ?? null,
    }
  },

  listHosts(): HostRecord[] {
    ensureLocalHostRecord()
    return state.hosts
      .map(sanitizeHost)
      .sort((left, right) => left.name.localeCompare(right.name))
  },

  getHost(id: number): HostRecord | null {
    ensureLocalHostRecord()
    const host = state.hosts.find((item) => item.id === id)
    return host ? sanitizeHost(host) : null
  },

  getHostWithSecret(id: number): HostWithSecret | null {
    ensureLocalHostRecord()
    return state.hosts.find((item) => item.id === id) ?? null
  },

  createHost(input: HostCreateInput): HostRecord {
    const host = normalizeHost(input)
    state.hosts.push(host)
    return sanitizeHost(host)
  },

  ensureLocalHost(): HostRecord {
    return sanitizeHost(ensureLocalHostRecord())
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
    const metadata = {
      hostId,
      projectId,
      threadId,
      preview: thread.preview ?? thread.name ?? null,
      cwd: thread.cwd ?? null,
      updatedAt: nowIso(),
    }
    const index = state.threadMetadata.findIndex((item) => item.hostId === hostId && item.threadId === threadId)
    if (index >= 0) {
      state.threadMetadata[index] = metadata
    } else {
      state.threadMetadata.push(metadata)
    }
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
    ensureLocalHostRecord()
    return {
      hosts: state.hosts.length,
      projects: state.projects.length,
    }
  },
}
