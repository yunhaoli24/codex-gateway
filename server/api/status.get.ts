import { persistence } from '../utils/gateway/db'
import { threadBroker } from '../utils/gateway/broker'
import type { GatewayStatus } from '~~/shared/types'

export default defineEventHandler((): GatewayStatus => {
  return {
    ...persistence.counts(),
    activeControllers: threadBroker.status(),
  }
})
