import { readValidatedBody } from 'h3'
import { runtimeState } from '../../utils/gateway/runtime-state'
import { hostCreateSchema } from '../../utils/gateway/validation'

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => hostCreateSchema.parse(body))
  return runtimeState.createHost(input)
})
