import { readValidatedBody } from 'h3'
import { persistence } from '../../utils/gateway/db'
import { threadBroker } from '../../utils/gateway/broker'
import { requireRecord, turnSteerSchema } from '../../utils/gateway/validation'

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => turnSteerSchema.parse(body))
  const host = requireRecord(persistence.getHostWithSecret(input.hostId), 'Host not found')
  return threadBroker.steerTurn(host, input.threadId, {
    text: input.text,
    expectedTurnId: input.expectedTurnId,
    clientUserMessageId: input.clientUserMessageId,
    images: input.images,
  })
})
