import { readValidatedBody } from 'h3'
import { persistence } from '../../utils/gateway/db'
import { hostCreateSchema } from '../../utils/gateway/validation'

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => hostCreateSchema.parse(body))
  return persistence.createHost(input)
})
