import { getValidatedQuery } from 'h3'
import { persistence } from '../../utils/gateway/db'
import { threadBroker } from '../../utils/gateway/broker'
import { requireRecord, threadReadSchema } from '../../utils/gateway/validation'

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, (body) => threadReadSchema.parse(body))
  const host = requireRecord(persistence.getHostWithSecret(query.hostId), 'Host not found')
  return threadBroker.readThread(host, query.threadId)
})
