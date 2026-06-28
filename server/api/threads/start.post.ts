import { readValidatedBody } from 'h3'
import { runtimeState } from '../../utils/gateway/runtime-state'
import { threadBroker } from '../../utils/gateway/broker'
import { requireRecord, threadStartSchema } from '../../utils/gateway/validation'

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => threadStartSchema.parse(body))
  const host = requireRecord(runtimeState.getHostWithSecret(input.hostId), 'Host not found')
  return threadBroker.startThread(host, {
    cwd: input.cwd || undefined,
    model: input.model || undefined,
    effort: input.effort || undefined,
    approvalPolicy: input.approvalPolicy || undefined,
  }, input.projectId ?? null)
})
