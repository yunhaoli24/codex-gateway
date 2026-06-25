import { persistence } from '../../../utils/gateway/db'
import { hostManager } from '../../../utils/gateway/ssh'
import { requireRecord } from '../../../utils/gateway/validation'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const host = requireRecord(persistence.getHostWithSecret(id), 'Host not found')
  return hostManager.verify(host)
})
