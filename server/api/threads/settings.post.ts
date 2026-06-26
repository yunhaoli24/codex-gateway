import { readValidatedBody } from 'h3'
import { persistence } from '../../utils/gateway/db'
import { threadBroker } from '../../utils/gateway/broker'
import { requireRecord, threadSettingsUpdateSchema } from '../../utils/gateway/validation'

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => threadSettingsUpdateSchema.parse(body))
  const host = requireRecord(persistence.getHostWithSecret(input.hostId), 'Host not found')
  return threadBroker.updateThreadSettings(host, input.threadId, {
    model: input.model,
    effort: input.effort,
    approvalPolicy: input.approvalPolicy,
  })
})
