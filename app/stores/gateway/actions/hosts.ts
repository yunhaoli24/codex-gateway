import type { HostRecord } from '~~/shared/types'
import type { GatewayStoreContext } from '../types'

export function createHostActions(ctx: GatewayStoreContext) {
  return {
    async createHost(input: Record<string, unknown>) {
      const host = await $fetch<HostRecord>('/api/hosts', { method: 'POST', body: input })
      ctx.state.hosts.push(host)
      ctx.persistConfig()
      ctx.state.selectedHostId = host.id
      ctx.state.selectedProjectId = null
      await ctx.listThreads()
      ctx.ensureSelectedProject()
      if (ctx.state.selectedProjectId) {
        await ctx.listThreads()
      }
      return host
    },

    async verifyHost(hostId: number) {
      return $fetch(`/api/hosts/${hostId}/verify`, { method: 'POST' })
    },

    async deleteHost(hostId: number) {
      await $fetch(`/api/hosts/${hostId}`, { method: 'DELETE' })
      ctx.state.hosts = ctx.state.hosts.filter((host) => host.id !== hostId)
      ctx.state.projects = ctx.state.projects.filter((project) => project.hostId !== hostId)
      ctx.state.gatewayConfig.pinnedThreads = ctx.state.gatewayConfig.pinnedThreads.filter((thread) => thread.hostId !== hostId)
      ctx.persistConfig()
      if (ctx.state.selectedHostId === hostId) {
        ctx.state.selectedHostId = ctx.state.hosts[0]?.id ?? null
        ctx.state.selectedProjectId = null
        ctx.state.selectedThreadId = null
        ctx.state.threads = []
        ctx.state.currentThread = null
        ctx.state.history = null
        ctx.state.events = []
        ctx.state.olderTurnsCursor = null
        ctx.state.newerTurnsCursor = null
        ctx.state.models = []
        if (ctx.state.selectedHostId) {
          await ctx.listModels()
          await ctx.listThreads()
        }
      }
    },

    async selectHost(hostId: number) {
      ctx.state.selectedHostId = hostId
      const currentProject = ctx.state.projects.find((project) => project.id === ctx.state.selectedProjectId)
      if (!currentProject || currentProject.hostId !== hostId) {
        ctx.state.selectedProjectId = null
      }
      ctx.state.selectedThreadId = null
      ctx.state.currentThread = null
      ctx.state.history = null
      ctx.state.events = []
      ctx.state.olderTurnsCursor = null
      ctx.state.newerTurnsCursor = null
      ctx.state.models = []
      await ctx.listModels()
      await ctx.listThreads()
      ctx.ensureSelectedProject()
      if (ctx.state.selectedProjectId) {
        await ctx.listThreads()
      }
    },
  }
}
