import { readValidatedBody } from 'h3'
import { runtimeState } from '../../utils/gateway/runtime-state'
import { threadBroker } from '../../utils/gateway/broker'
import { requireRecord, turnSteerSchema } from '../../utils/gateway/validation'
import { hostLogContext, setGatewayRequestLogContext } from '../../utils/gateway/errors'

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => turnSteerSchema.parse(body))
  const host = requireRecord(runtimeState.getHostWithSecret(input.hostId), 'Host not found')
  setGatewayRequestLogContext(event,
    'turns/steer',
    {
      ...hostLogContext(host),
      threadId: input.threadId,
      expectedTurnId: input.expectedTurnId,
      clientUserMessageId: input.clientUserMessageId ?? null,
      textLength: input.text.length,
      imageCount: input.images.length,
    },
  )
  return threadBroker.steerTurn(host, input.threadId, {
    text: input.text,
    expectedTurnId: input.expectedTurnId,
    clientUserMessageId: input.clientUserMessageId,
    images: input.images,
  })
})
