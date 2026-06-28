import { readValidatedBody } from 'h3'
import { runtimeState } from '../../utils/gateway/runtime-state'
import { threadBroker } from '../../utils/gateway/broker'
import { requireRecord, threadOpenSchema } from '../../utils/gateway/validation'
import { hostLogContext, setGatewayRequestLogContext } from '../../utils/gateway/errors'

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => threadOpenSchema.parse(body))
  const host = requireRecord(runtimeState.getHostWithSecret(input.hostId), 'Host not found')
  setGatewayRequestLogContext(event,
    'threads/open',
    {
      ...hostLogContext(host),
      threadId: input.threadId,
      projectId: input.projectId ?? null,
      limit: input.limit,
    },
  )
  return threadBroker.openThread(host, input.threadId, input.projectId ?? null, input.limit)
})
