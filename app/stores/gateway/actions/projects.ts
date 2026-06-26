import type { ModelListResult, ProjectRecord, RemoteDirectoryEntry } from '~~/shared/types'
import type { GatewayStoreContext } from '../types'
import { writeGatewayRouteSelection } from '../route-state'
import { messageFromError } from '../thread-utils'

export function createProjectActions(ctx: GatewayStoreContext) {
  return {
    async selectProject(projectId: number) {
      ctx.state.selectedProjectId = projectId
      ctx.state.selectedThreadId = null
      ctx.state.currentThread = null
      ctx.state.history = null
      ctx.state.events = []
      ctx.state.olderTurnsCursor = null
      ctx.state.newerTurnsCursor = null
      writeGatewayRouteSelection({
        hostId: ctx.state.selectedHostId,
        projectId,
        threadId: null,
      })
      await ctx.listThreads()
    },

    async listRemoteDirectories(path = '~') {
      if (!ctx.state.selectedHostId) {
        return { path, entries: [] as RemoteDirectoryEntry[] }
      }

      return $fetch<{ path: string, entries: RemoteDirectoryEntry[] }>('/api/remote/directories', {
        query: {
          hostId: ctx.state.selectedHostId,
          path,
        },
      })
    },

    async listModels() {
      if (!ctx.state.selectedHostId) {
        ctx.state.models = []
        return
      }

      ctx.state.loadingModels = true
      try {
        const response = await $fetch<ModelListResult>('/api/models', {
          query: {
            hostId: ctx.state.selectedHostId,
            includeHidden: false,
            limit: 50,
          },
        })
        ctx.state.models = response.data ?? []
      } catch (error: any) {
        ctx.setError(messageFromError(error, 'Failed to list models'))
      } finally {
        ctx.state.loadingModels = false
      }
    },

    async createProject(input: Record<string, unknown>) {
      const project = await $fetch<ProjectRecord>('/api/projects', { method: 'POST', body: input })
      const index = ctx.state.projects.findIndex((item) => item.id === project.id)
      if (index >= 0) {
        ctx.state.projects[index] = project
      } else {
        ctx.state.projects.push(project)
      }
      ctx.persistConfig()
      ctx.state.selectedProjectId = project.id
      ctx.state.selectedThreadId = null
      ctx.state.currentThread = null
      ctx.state.history = null
      ctx.state.events = []
      writeGatewayRouteSelection({
        hostId: project.hostId,
        projectId: project.id,
        threadId: null,
      })
      await ctx.listThreads()
      return project
    },

    mergeProjects(projects: ProjectRecord[]) {
      for (const project of projects) {
        const index = ctx.state.projects.findIndex((item) => item.id === project.id)
        if (index >= 0) {
          ctx.state.projects[index] = project
        } else {
          ctx.state.projects.push(project)
        }
      }
      ctx.persistConfig()
    },

    ensureSelectedProject() {
      if (!ctx.state.selectedHostId || ctx.state.selectedProjectId) {
        return
      }
      ctx.state.selectedProjectId = ctx.state.projects.find((project) => project.hostId === ctx.state.selectedHostId)?.id ?? null
    },
  }
}
