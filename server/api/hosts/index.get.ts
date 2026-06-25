import { persistence } from '../../utils/gateway/db'

export default defineEventHandler(() => {
  return persistence.listHosts()
})
