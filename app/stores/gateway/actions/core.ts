import { toast } from 'vue-sonner'
import type { GatewayConfig, GatewayStatus } from '~~/shared/types'
import { CONFIG_STORAGE_KEY, defaultGatewayConfig } from '../config'
import type { GatewayStoreContext } from '../types'
import { messageFromError } from '../thread-utils'
import { hasGatewayRouteSelection, readGatewayRouteSelection, writeGatewayRouteSelection } from '../route-state'

export function createCoreActions(ctx: GatewayStoreContext) {
  return {
    hydrateConfig() {
      if (!import.meta.client) {
        return
      }
      try {
        const raw = localStorage.getItem(CONFIG_STORAGE_KEY)
        ctx.state.gatewayConfig = raw ? { ...defaultGatewayConfig(), ...JSON.parse(raw) } : defaultGatewayConfig()
        ctx.state.hosts = ctx.state.gatewayConfig.hosts
      } catch {
        ctx.state.gatewayConfig = defaultGatewayConfig()
      }
    },

    persistConfig() {
      ctx.state.gatewayConfig = {
        version: 1,
        hosts: ctx.state.hosts,
        pinnedThreads: ctx.state.gatewayConfig.pinnedThreads,
        lastOpenThread: ctx.state.gatewayConfig.lastOpenThread ?? null,
      }
      if (import.meta.client) {
        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(ctx.state.gatewayConfig))
      }
    },

    async syncConfigToServer() {
      const config = await $fetch<GatewayConfig>('/api/config/sync', {
        method: 'POST',
        body: ctx.state.gatewayConfig,
      })
      ctx.state.gatewayConfig = {
        ...defaultGatewayConfig(),
        ...config,
        pinnedThreads: ctx.state.gatewayConfig.pinnedThreads.length ? ctx.state.gatewayConfig.pinnedThreads : config.pinnedThreads,
      }
      ctx.state.hosts = ctx.state.gatewayConfig.hosts
      ctx.persistConfig()
    },

    exportConfigText() {
      ctx.persistConfig()
      return JSON.stringify(ctx.state.gatewayConfig, null, 2)
    },

    async importConfigText(text: string) {
      const config = JSON.parse(text) as GatewayConfig
      const syncedConfig = await $fetch<GatewayConfig>('/api/config/sync', {
        method: 'POST',
        body: { ...defaultGatewayConfig(), ...config },
      })
      ctx.state.gatewayConfig = { ...defaultGatewayConfig(), ...syncedConfig }
      ctx.state.hosts = ctx.state.gatewayConfig.hosts
      ctx.state.projects = []
      ctx.persistConfig()
      await ctx.refresh()
    },

    async refresh() {
      ctx.state.initializing = true
      ctx.state.loading = true
      ctx.state.error = null
      try {
        const routeSelection = readGatewayRouteSelection()
        ctx.hydrateConfig()
        ctx.state.projects = []
        ctx.state.threads = []
        ctx.state.models = []
        await ctx.syncConfigToServer()
        const status = await $fetch<GatewayStatus>('/api/status')
        ctx.state.status = status

        const routeHostExists = routeSelection.hostId
          ? ctx.state.hosts.some((host) => host.id === routeSelection.hostId)
          : false
        if (routeHostExists) {
          ctx.state.selectedHostId = routeSelection.hostId
        } else if (!ctx.state.selectedHostId) {
          ctx.state.selectedHostId = ctx.state.hosts[0]?.id ?? null
        }
        ctx.state.selectedProjectId = routeHostExists ? routeSelection.projectId : null
        ctx.state.selectedThreadId = null
        ctx.state.currentThread = null
        ctx.state.history = null
        ctx.state.events = []
        ctx.state.olderTurnsCursor = null
        ctx.state.newerTurnsCursor = null

        await ctx.listModels()
        await ctx.listThreads()
        if (!ctx.state.selectedProjectId) {
          ctx.ensureSelectedProject()
        }
        if (ctx.state.selectedProjectId) {
          await ctx.listThreads()
        }
        if (routeHostExists && routeSelection.threadId) {
          await ctx.openThread(routeSelection.threadId, {
            hostId: routeSelection.hostId,
            projectId: routeSelection.projectId,
            replaceRoute: true,
          })
        } else if (!hasGatewayRouteSelection(routeSelection) && ctx.state.gatewayConfig.lastOpenThread?.hostId) {
          await ctx.restoreLastOpenThread()
        } else {
          writeGatewayRouteSelection({
            hostId: ctx.state.selectedHostId,
            projectId: ctx.state.selectedProjectId,
            threadId: null,
          }, { replace: true })
        }
      } catch (error: any) {
        ctx.setError(messageFromError(error, 'Failed to bootstrap gateway'))
      } finally {
        ctx.state.loading = false
        ctx.state.initializing = false
      }
    },

    setError(message: string) {
      ctx.state.error = message
      if (import.meta.client) {
        toast.error(message)
      }
    },
  }
}
