import { readValidatedBody } from 'h3'
import { persistence } from '../../utils/gateway/db'
import { hostManager } from '../../utils/gateway/ssh'
import { gatewayConfigSchema } from '../../utils/gateway/validation'

export default defineEventHandler(async (event) => {
  const config = await readValidatedBody(event, (body) => gatewayConfigSchema.parse(body))
  persistence.replaceConfig(config)
  hostManager.syncHosts(persistence.listHostsWithSecret())
  return persistence.exportConfig()
})
