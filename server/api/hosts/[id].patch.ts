import { readValidatedBody } from 'h3'
import { persistence } from '../../utils/gateway/db'
import { hostManager } from '../../utils/gateway/ssh'
import { hostUpdateSchema, requireRecord } from '../../utils/gateway/validation'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const input = await readValidatedBody(event, (body) => hostUpdateSchema.parse(body))
  const host = requireRecord(persistence.updateHost(id, input), 'Host not found')
  hostManager.syncHosts(persistence.listHostsWithSecret())
  return host
})
