import type { GatewayStoreState } from './types'
import { defaultGatewayConfig } from './config'

export function createGatewayState(): GatewayStoreState {
  return {
    hosts: [],
    projects: [],
    threads: [],
    models: [],
    loadingModels: false,
    gatewayConfig: defaultGatewayConfig(),
    openingPinnedThreadKey: null,
    runningThreadKeys: [],
    threadStatuses: {},
    threadSettingsByKey: {},
    selectedHostId: null,
    selectedProjectId: null,
    selectedThreadId: null,
    currentThread: null,
    history: null,
    events: [],
    status: null,
    initializing: true,
    loading: false,
    loadingOlderTurns: false,
    olderTurnsCursor: null,
    newerTurnsCursor: null,
    error: null,
    eventSource: null,
    lastEventId: 0,
    scrollToLatestToken: 0,
  }
}
