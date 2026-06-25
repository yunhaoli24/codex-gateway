import { getQuery } from 'h3'
import { persistence } from '../../utils/gateway/db'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const hostId = query.hostId ? Number(query.hostId) : undefined
  return persistence.listProjects(hostId)
})
