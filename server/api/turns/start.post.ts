import { readValidatedBody } from 'h3'
import { runtimeState } from '../../utils/gateway/runtime-state'
import { threadBroker } from '../../utils/gateway/broker'
import { requireRecord, turnStartSchema } from '../../utils/gateway/validation'
import { hostLogContext, setGatewayRequestLogContext } from '../../utils/gateway/errors'

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => turnStartSchema.parse(body))
  const host = requireRecord(runtimeState.getHostWithSecret(input.hostId), 'Host not found')
  setGatewayRequestLogContext(event,
    'turns/start',
    {
      ...hostLogContext(host),
      threadId: input.threadId,
      cwd: input.cwd ?? null,
      model: input.model ?? null,
      effort: input.effort ?? null,
      approvalPolicy: input.approvalPolicy ?? null,
      clientUserMessageId: input.clientUserMessageId ?? null,
      textLength: input.text.length,
      imageCount: input.images.length,
      fileCount: input.files.length,
    },
  )
  return threadBroker.startTurn(host, input.threadId, {
    text: input.text,
    cwd: input.cwd,
    clientUserMessageId: input.clientUserMessageId,
    model: input.model,
    effort: input.effort,
    approvalPolicy: input.approvalPolicy,
    images: input.images,
    files: input.files,
  })
})
