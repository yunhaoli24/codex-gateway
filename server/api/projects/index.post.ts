import { readValidatedBody } from 'h3'
import { persistence } from '../../utils/gateway/db'
import { projectCreateSchema, requireRecord } from '../../utils/gateway/validation'

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => projectCreateSchema.parse(body))
  requireRecord(persistence.getHost(input.hostId), 'Host not found')
  return persistence.createProject(input)
})
