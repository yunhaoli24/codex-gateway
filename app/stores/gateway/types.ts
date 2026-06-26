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
export type HostConnectionStatus = 'idle' | 'connecting' | 'connected' | 'failed'

export interface ThreadListResponse {
  data?: Array<any>
  nextCursor?: string | null
  backwardsCursor?: string | null
  projects?: ProjectRecord[]
}

export interface GatewayStoreState {
  hosts: HostRecord[]
  projects: ProjectRecord[]
  threads: Array<any>
  models: ModelRecord[]
  loadingModels: boolean
  hostConnectionStatuses: Record<number, { status: HostConnectionStatus, message?: string | null }>
  gatewayConfig: GatewayConfig
  openingPinnedThreadKey: string | null
  runningThreadKeys: string[]
  threadStatuses: Record<string, ThreadRuntimeStatus>
  threadSettingsByKey: Record<string, ThreadSettingsState>
  threadTokenUsageByKey: Record<string, ThreadTokenUsageState>
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
  eventSource: EventSource | null
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
