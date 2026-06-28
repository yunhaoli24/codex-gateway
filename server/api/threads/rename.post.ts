import { readValidatedBody } from 'h3'
import { runtimeState } from '../../utils/gateway/runtime-state'
import { threadBroker } from '../../utils/gateway/broker'
import { requireRecord, threadRenameSchema } from '../../utils/gateway/validation'

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => threadRenameSchema.parse(body))
  const host = requireRecord(runtimeState.getHostWithSecret(input.hostId), 'Host not found')
  await threadBroker.renameThread(host, input.threadId, input.name)
  return { ok: true }
})
