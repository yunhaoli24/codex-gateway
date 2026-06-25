import { getValidatedQuery } from 'h3'
import { persistence } from '../../utils/gateway/db'
import { threadBroker } from '../../utils/gateway/broker'
import { requireRecord, threadTurnsListSchema } from '../../utils/gateway/validation'

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, (body) => threadTurnsListSchema.parse(body))
  const host = requireRecord(persistence.getHostWithSecret(query.hostId), 'Host not found')
  return threadBroker.listThreadTurns(host, query.threadId, {
    cursor: query.cursor ?? null,
    limit: query.limit,
    sortDirection: query.sortDirection,
  })
})
