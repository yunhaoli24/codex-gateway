import { getValidatedQuery } from 'h3'
import { runtimeState } from '../../utils/gateway/runtime-state'
import { threadBroker } from '../../utils/gateway/broker'
import { modelListSchema, requireRecord } from '../../utils/gateway/validation'

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, (body) => modelListSchema.parse(body))
  const host = requireRecord(runtimeState.getHostWithSecret(query.hostId), 'Host not found')

  return threadBroker.listModels(host, {
    includeHidden: query.includeHidden ?? false,
    limit: query.limit,
    cursor: query.cursor ?? null,
  })
})
