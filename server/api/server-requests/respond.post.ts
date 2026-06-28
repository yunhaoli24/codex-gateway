import { readValidatedBody } from 'h3'
import { runtimeState } from '../../utils/gateway/runtime-state'
import { threadBroker } from '../../utils/gateway/broker'
import { hostLogContext, setGatewayRequestLogContext } from '../../utils/gateway/errors'
import { requireRecord, serverRequestResponseSchema } from '../../utils/gateway/validation'

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => serverRequestResponseSchema.parse(body))
  const host = requireRecord(runtimeState.getHostWithSecret(input.hostId), 'Host not found')
  setGatewayRequestLogContext(event, 'server-requests/respond', {
    ...hostLogContext(host),
    threadId: input.threadId,
    requestId: input.requestId,
    hasError: Boolean(input.error),
  })
  await threadBroker.respondToServerRequest(host, input.threadId, {
    requestId: input.requestId,
    result: input.result,
    error: input.error,
  })
  return {}
})
