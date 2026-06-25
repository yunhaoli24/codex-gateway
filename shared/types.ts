export type HostAuthMode = 'agent' | 'privateKey' | 'password'

export interface HostRecord {
  id: number
  name: string
  sshHost: string
  username: string | null
  port: number | null
  authMode: HostAuthMode
  privateKeyPath: string | null
  hasPassword: boolean
  appServerMode: 'local' | 'stdio' | 'websocket'
  appServerUrl: string | null
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
  password?: string | null
  appServerMode?: 'local' | 'stdio' | 'websocket'
  appServerUrl?: string | null
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
  recentEvents: GatewayEvent[]
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
