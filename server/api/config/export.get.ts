import { runtimeState } from '../../utils/gateway/runtime-state'

export default defineEventHandler(() => {
  return runtimeState.exportConfig()
})
