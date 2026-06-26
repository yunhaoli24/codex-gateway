import type { GatewayConfig } from '~~/shared/types'

export const CONFIG_STORAGE_KEY = 'codex-gateway-config'

export function defaultGatewayConfig(): GatewayConfig {
  return {
    version: 1,
    hosts: [],
    pinnedThreads: [],
    lastOpenThread: null,
  }
}
