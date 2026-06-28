import { getQuery } from 'h3'
import { runtimeState } from '../../utils/gateway/runtime-state'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const hostId = query.hostId ? Number(query.hostId) : undefined
  return runtimeState.listProjects(hostId)
})
