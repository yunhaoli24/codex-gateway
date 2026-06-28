import { runtimeState } from '../utils/gateway/runtime-state'
import { threadBroker } from '../utils/gateway/broker'
import type { GatewayStatus } from '~~/shared/types'

export default defineEventHandler((): GatewayStatus => {
  return {
    ...runtimeState.counts(),
    activeControllers: threadBroker.status(),
  }
})
