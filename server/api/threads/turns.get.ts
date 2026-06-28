import { getValidatedQuery } from 'h3'
import { runtimeState } from '../../utils/gateway/runtime-state'
import { threadBroker } from '../../utils/gateway/broker'
import { requireRecord, threadTurnsListSchema } from '../../utils/gateway/validation'

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, (body) => threadTurnsListSchema.parse(body))
  const host = requireRecord(runtimeState.getHostWithSecret(query.hostId), 'Host not found')
  return threadBroker.listThreadTurns(host, query.threadId, {
    cursor: query.cursor ?? null,
    limit: query.limit,
    sortDirection: query.sortDirection,
  })
})
