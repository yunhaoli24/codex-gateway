import { persistence } from '../../utils/gateway/db'
import { hostManager } from '../../utils/gateway/ssh'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  persistence.deleteHost(id)
  hostManager.disconnect(id)
  return { ok: true }
})
