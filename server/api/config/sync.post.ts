import { readValidatedBody } from 'h3'
import { persistence } from '../../utils/gateway/db'
import { gatewayConfigSchema } from '../../utils/gateway/validation'

export default defineEventHandler(async (event) => {
  const config = await readValidatedBody(event, (body) => gatewayConfigSchema.parse(body))
  persistence.replaceConfig(config)
  return persistence.exportConfig()
})
