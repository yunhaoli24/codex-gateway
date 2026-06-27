import type {
  GatewayConfig,
  GatewayEvent,
  GatewayStatus,
  HostRecord,
  ModelRecord,
  PinnedThreadRecord,
  ProjectRecord,
  ThreadSettingsState,
  ThreadTokenUsageState,
} from '~~/shared/types'
import type { GatewayDomainEvents } from './domain-events'

export type ThreadRuntimeStatus = 'idle' | 'running' | 'completed' | 'failed' | 'interrupted'
export type HostConnectionStatus = 'idle' | 'checkingVersion' | 'upgrading' | 'restarting' | 'connecting' | 'connected' | 'failed'

export interface ThreadListResponse {
  data?: Array<any>
  nextCursor?: string | null
  backwardsCursor?: string | null
  projects?: ProjectRecord[]
}

export interface ThreadSnapshot {
  hostId: number
  projectId: number | null
  threadId: string
  currentThread: unknown
  history: unknown
  events: GatewayEvent[]
  olderTurnsCursor: string | null
  newerTurnsCursor: string | null
  lastEventId: number
}

export interface GatewayStoreState {
  hosts: HostRecord[]
  projects: ProjectRecord[]
  threads: Array<any>
  models: ModelRecord[]
  loadingModels: boolean
  hostConnectionStatuses: Record<number, { status: HostConnectionStatus, message?: string | null, updatedAt?: number }>
  gatewayConfig: GatewayConfig
  openingPinnedThreadKey: string | null
  runningThreadKeys: string[]
  threadStatuses: Record<string, ThreadRuntimeStatus>
  threadSettingsByKey: Record<string, ThreadSettingsState>
  threadTokenUsageByKey: Record<string, ThreadTokenUsageState>
  threadSnapshots: Record<string, ThreadSnapshot>
  selectedHostId: number | null
  selectedProjectId: number | null
  selectedThreadId: string | null
  currentThread: unknown
  history: unknown
  events: GatewayEvent[]
  status: GatewayStatus | null
  initializing: boolean
  loading: boolean
  loadingOlderTurns: boolean
  olderTurnsCursor: string | null
  newerTurnsCursor: string | null
  error: string | null
  realtimeSocket: WebSocket | null
  realtimeSocketConnected: boolean
  realtimeSocketReconnectTimer: ReturnType<typeof window.setTimeout> | null
  realtimeSocketReconnectAttempt: number
  realtimeSocketGeneration: number
  realtimeHostLifecycleSubscribed: boolean
  realtimeThreadSubscriptions: Record<string, { hostId: number, threadId: string, afterId: number }>
  lastEventId: number
  scrollToLatestToken: number
}

export interface GatewayStoreContext {
  state: GatewayStoreState
  events: GatewayDomainEvents
  selectedHost: HostRecord | null
  selectedProject: ProjectRecord | null
  pinnedThreads: PinnedThreadRecord[]
  runningThreadKeySet: Set<string>
  selectedThreadStatus: ThreadRuntimeStatus
  defaultModel: ModelRecord | null
  selectedThreadSettings: ThreadSettingsState
  selectedThreadTokenUsage: ThreadTokenUsageState | null
  [action: string]: any
}
