export type HostAuthMode = 'agent' | 'privateKey' | 'password'

export interface HostRecord {
  id: number
  name: string
  sshHost: string
  username: string | null
  port: number | null
  authMode: HostAuthMode
  privateKeyPath: string | null
  privateKey?: string | null
  password?: string | null
  hasPassword: boolean
  createdAt: string
  updatedAt: string
}

export interface ProjectRecord {
  id: number
  hostId: number
  name: string
  remotePath: string
  createdAt: string
  updatedAt: string
}

export interface HostCreateInput {
  name: string
  sshHost: string
  username?: string | null
  port?: number | null
  authMode: HostAuthMode
  privateKeyPath?: string | null
  privateKey?: string | null
  password?: string | null
}

export interface ProjectCreateInput {
  hostId: number
  name: string
  remotePath: string
}

export interface RpcEnvelope {
  id?: number | string
  method?: string
  params?: unknown
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

export interface GatewayEvent {
  id: number
  hostId: number
  threadId: string
  method: string
  payload: RpcEnvelope
  createdAt: string
}

export interface ThreadOpenResult {
  thread: unknown
  history: unknown
  projectId?: number | null
  project?: ProjectRecord | null
  turnsPage: {
    nextCursor: string | null
    backwardsCursor: string | null
  }
  recentEvents: GatewayEvent[]
}

export interface ThreadTurnsPageResult {
  history: unknown
  turnsPage: {
    nextCursor: string | null
    backwardsCursor: string | null
  }
}

export interface GatewayStatus {
  hosts: number
  projects: number
  activeControllers: Array<{
    hostId: number
    threadId: string
    subscribers: number
    eventBufferSize: number
  }>
}

export interface RemoteDirectoryEntry {
  name: string
  path: string
  type: 'directory' | 'file' | 'other'
}

export interface PinnedThreadRecord {
  hostId: number
  projectId: number | null
  threadId: string
  title: string
  subtitle?: string | null
  hostName: string
  projectName?: string | null
  updatedAt?: number | null
}

export interface GatewayConfig {
  version: 1
  hosts: HostRecord[]
  pinnedThreads: PinnedThreadRecord[]
  lastOpenThread?: {
    hostId: number
    projectId: number | null
    threadId: string
  } | null
}
