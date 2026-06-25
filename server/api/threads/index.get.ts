import { getValidatedQuery } from 'h3'
import { persistence } from '../../utils/gateway/db'
import { threadBroker } from '../../utils/gateway/broker'
import { requireRecord, threadListSchema } from '../../utils/gateway/validation'

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, (body) => threadListSchema.parse(body))
  const host = requireRecord(persistence.getHostWithSecret(query.hostId), 'Host not found')

  const result = await threadBroker.listThreads(host, {
    limit: query.limit,
    cursor: query.cursor || null,
    cwd: query.cwd || undefined,
    searchTerm: query.searchTerm || undefined,
  })

  const threads = Array.isArray((result as any)?.data) ? (result as any).data : []
  for (const thread of threads) {
    if (typeof thread?.cwd === 'string' && thread.cwd.trim()) {
      try {
        const project = persistence.ensureProjectForPath(host.id, thread.cwd)
        persistence.recordThread(host.id, project.id, thread)
      } catch (error) {
        console.warn('[gateway] failed to index thread project', {
          hostId: host.id,
          threadId: thread?.id,
          cwd: thread.cwd,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }
  return {
    ...(result as Record<string, unknown>),
    data: threads,
    projects: persistence.listProjects(host.id),
  }
})
