import { persistence } from '../utils/gateway/db'

export default defineEventHandler(() => {
  const host = persistence.ensureLocalHost()
  return {
    host,
    hosts: persistence.listHosts(),
    projects: persistence.listProjects(),
  }
})
