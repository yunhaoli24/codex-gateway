import { readValidatedBody } from 'h3'
import { persistence } from '../../utils/gateway/db'
import { threadBroker } from '../../utils/gateway/broker'
import { requireRecord, turnStartSchema } from '../../utils/gateway/validation'

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => turnStartSchema.parse(body))
  const host = requireRecord(persistence.getHostWithSecret(input.hostId), 'Host not found')
  return threadBroker.startTurn(host, input.threadId, {
    text: input.text,
    cwd: input.cwd,
    clientUserMessageId: input.clientUserMessageId,
    images: input.images,
  })
})
