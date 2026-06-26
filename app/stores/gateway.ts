import { defineStore } from 'pinia'
import type {
  GatewayEvent,
  GatewayConfig,
  GatewayStatus,
  HostRecord,
  PinnedThreadRecord,
  ProjectRecord,
  RemoteDirectoryEntry,
  ThreadOpenResult,
  ThreadTurnsPageResult,
} from '~~/shared/types'

const CONFIG_STORAGE_KEY = 'codex-gateway-config'

interface ThreadListResponse {
  data?: Array<any>
  nextCursor?: string | null
  backwardsCursor?: string | null
  projects?: ProjectRecord[]
}

function ensureHistoryThread(history: unknown, currentThread: unknown, threadId: string) {
  const historyRecord = (history && typeof history === 'object' ? history as Record<string, any> : null)
  const existingThread = historyRecord?.thread || (currentThread && typeof currentThread === 'object' ? currentThread as Record<string, any> : {})
  const thread = {
    ...existingThread,
    id: existingThread?.id || threadId,
    turns: Array.isArray(existingThread?.turns) ? [...existingThread.turns] : [],
  }
  return { thread }
}

function mergeThreadTurns(history: unknown, currentThread: unknown, threadId: string, turns: any[], direction: 'prepend' | 'append') {
  const nextHistory = ensureHistoryThread(history, currentThread, threadId)
  const existingTurns = nextHistory.thread.turns
  const seen = new Set(existingTurns.map((turn: any) => turn?.id).filter(Boolean).map(String))
  const incoming = turns.filter((turn: any) => {
    if (!turn?.id) {
      return true
    }
    const id = String(turn.id)
    if (seen.has(id)) {
      return false
    }
    seen.add(id)
    return true
  })
  nextHistory.thread.turns = direction === 'prepend'
    ? [...incoming, ...existingTurns]
    : [...existingTurns, ...incoming]
  return nextHistory
}

function sortThreads(threads: any[]) {
  return [...threads].sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) {
      return left.pinned ? -1 : 1
    }
    return Number(right.recencyAt || right.updatedAt || 0) - Number(left.recencyAt || left.updatedAt || 0)
  })
}

function defaultGatewayConfig(): GatewayConfig {
  return {
    version: 1,
    hosts: [],
    pinnedThreads: [],
    lastOpenThread: null,
  }
}

function pinnedKey(hostId: number, threadId: string) {
  return `${hostId}:${threadId}`
}

function titleForThread(thread: any) {
  return thread?.name || thread?.preview || thread?.id || 'Untitled'
}

function itemId(item: any) {
  return item?.id ? String(item.id) : ''
}

function itemClientId(item: any) {
  return item?.clientId ? String(item.clientId) : ''
}

function sameItem(left: any, right: any) {
  const leftId = itemId(left)
  const rightId = itemId(right)
  if (leftId && rightId && leftId === rightId) {
    return true
  }

  const leftClientId = itemClientId(left)
  const rightClientId = itemClientId(right)
  return Boolean(leftClientId && rightClientId && leftClientId === rightClientId)
}

function findTurnForItem(turns: any[], item: any) {
  for (const turn of turns) {
    if (!Array.isArray(turn?.items)) {
      continue
    }
    const itemIndex = turn.items.findIndex((candidate: any) => sameItem(candidate, item))
    if (itemIndex >= 0) {
      return { turn, itemIndex }
    }
  }
  return null
}

function mergeItemIntoLatestTurn(history: unknown, currentThread: unknown, threadId: string, item: any) {
  if (!item || typeof item !== 'object') {
    return history
  }

  const nextHistory = ensureHistoryThread(history, currentThread, threadId)
  const turns = nextHistory.thread.turns
  const existing = findTurnForItem(turns, item)
  if (existing) {
    existing.turn.items = [...existing.turn.items]
    existing.turn.items[existing.itemIndex] = { ...existing.turn.items[existing.itemIndex], ...item }
    nextHistory.thread.turns = [...turns]
    return nextHistory
  }

  let turnIndex = item.turnId ? turns.findIndex((candidate: any) => candidate?.id === item.turnId) : -1
  let turn = turnIndex >= 0 ? turns[turnIndex] : null
  if (!turn) {
    turn = turns.at(-1)
    turnIndex = turns.length - 1
  }
  if (!turn || !Array.isArray(turn.items)) {
    turn = { id: item.turnId || `live-${Date.now()}`, items: [], status: 'inProgress' }
    turns.push(turn)
    turnIndex = turns.length - 1
  } else {
    turn.items = [...turn.items]
  }

  const index = turn.items.findIndex((candidate: any) => sameItem(candidate, item))
  if (index >= 0) {
    turn.items[index] = { ...turn.items[index], ...item }
  } else {
    turn.items.push(item)
  }
  turns[turnIndex] = turn
  nextHistory.thread.turns = [...turns]
  return nextHistory
}

function appendAgentDelta(history: unknown, currentThread: unknown, threadId: string, params: any) {
  const itemIdValue = params?.itemId ? String(params.itemId) : ''
  const delta = params?.delta || ''
  if (!itemIdValue || !delta) {
    return history
  }

  const nextHistory = ensureHistoryThread(history, currentThread, threadId)
  const turns = nextHistory.thread.turns
  let turnIndex = params.turnId ? turns.findIndex((candidate: any) => candidate?.id === params.turnId) : -1
  let turn = turnIndex >= 0 ? turns[turnIndex] : null
  if (!turn) {
    turn = turns.at(-1)
    turnIndex = turns.length - 1
  }
  if (!turn || !Array.isArray(turn.items)) {
    turn = { id: params.turnId || `live-${Date.now()}`, items: [], status: 'inProgress' }
    turns.push(turn)
    turnIndex = turns.length - 1
  } else {
    turn.items = [...turn.items]
  }

  const index = turn.items.findIndex((candidate: any) => itemId(candidate) === itemIdValue)
  if (index >= 0) {
    const item = turn.items[index]
    turn.items[index] = { ...item, text: `${item.text || ''}${delta}` }
  } else {
    turn.items.push({
      type: 'agentMessage',
      id: itemIdValue,
      text: delta,
      phase: 'final_answer',
    })
  }
  turns[turnIndex] = turn
  nextHistory.thread.turns = [...turns]
  return nextHistory
}

function appendItemOutputDelta(history: unknown, currentThread: unknown, threadId: string, params: any, fallbackType: string) {
  const itemIdValue = params?.itemId ? String(params.itemId) : ''
  const delta = params?.delta || ''
  if (!itemIdValue || !delta) {
    return history
  }

  const nextHistory = ensureHistoryThread(history, currentThread, threadId)
  const turns = nextHistory.thread.turns
  let turnIndex = params.turnId ? turns.findIndex((candidate: any) => candidate?.id === params.turnId) : -1
  let turn = turnIndex >= 0 ? turns[turnIndex] : null
  if (!turn) {
    turn = turns.at(-1)
    turnIndex = turns.length - 1
  }
  if (!turn || !Array.isArray(turn.items)) {
    turn = { id: params.turnId || `live-${Date.now()}`, items: [], status: 'inProgress' }
    turns.push(turn)
    turnIndex = turns.length - 1
  } else {
    turn.items = [...turn.items]
  }

  const index = turn.items.findIndex((candidate: any) => itemId(candidate) === itemIdValue)
  if (index >= 0) {
    const item = turn.items[index]
    turn.items[index] = { ...item, aggregatedOutput: `${item.aggregatedOutput || ''}${delta}` }
  } else {
    turn.items.push({
      type: fallbackType,
      id: itemIdValue,
      turnId: params.turnId,
      status: 'inProgress',
      aggregatedOutput: delta,
    })
  }
  turns[turnIndex] = turn
  nextHistory.thread.turns = [...turns]
  return nextHistory
}

function updateTurnDiff(history: unknown, currentThread: unknown, threadId: string, params: any) {
  if (!params?.turnId || typeof params.diff !== 'string') {
    return history
  }

  const nextHistory = ensureHistoryThread(history, currentThread, threadId)
  const turns = nextHistory.thread.turns
  let turn = turns.find((candidate: any) => candidate?.id === params.turnId)
  if (!turn) {
    turn = { id: params.turnId, items: [], status: 'inProgress' }
    turns.push(turn)
  }
  turn.diff = params.diff
  nextHistory.thread.turns = [...turns]
  return nextHistory
}

function syncCompletedTurn(history: unknown, currentThread: unknown, threadId: string, turn: any) {
  if (!turn?.id) {
    return history
  }

  const nextHistory = ensureHistoryThread(history, currentThread, threadId)
  const turns = nextHistory.thread.turns
  const index = turns.findIndex((candidate: any) => candidate?.id === turn.id)
  if (index >= 0) {
    turns[index] = {
      ...turns[index],
      ...turn,
      items: Array.isArray(turn.items) && turn.items.length ? turn.items : turns[index].items,
    }
  } else {
    turns.push(turn)
  }
  nextHistory.thread.turns = [...turns]
  return nextHistory
}

export const useGatewayStore = defineStore('gateway', {
  state: () => ({
    hosts: [] as HostRecord[],
    projects: [] as ProjectRecord[],
    threads: [] as Array<any>,
    gatewayConfig: defaultGatewayConfig(),
    openingPinnedThreadKey: null as string | null,
    runningThreadKeys: [] as string[],
    selectedHostId: null as number | null,
    selectedProjectId: null as number | null,
    selectedThreadId: null as string | null,
    currentThread: null as unknown,
    history: null as unknown,
    events: [] as GatewayEvent[],
    status: null as GatewayStatus | null,
    initializing: true,
    loading: false,
    loadingOlderTurns: false,
    olderTurnsCursor: null as string | null,
    newerTurnsCursor: null as string | null,
    error: null as string | null,
    eventSource: null as EventSource | null,
    lastEventId: 0,
  }),

  getters: {
    selectedHost(state) {
      return state.hosts.find((host) => host.id === state.selectedHostId) ?? null
    },

    selectedProject(state) {
      return state.projects.find((project) => project.id === state.selectedProjectId) ?? null
    },

    pinnedThreads(state) {
      return state.gatewayConfig.pinnedThreads
    },

    runningThreadKeySet(state) {
      return new Set(state.runningThreadKeys)
    },
  },

  actions: {
    hydrateConfig() {
      if (!import.meta.client) {
        return
      }
      try {
        const raw = localStorage.getItem(CONFIG_STORAGE_KEY)
        this.gatewayConfig = raw ? { ...defaultGatewayConfig(), ...JSON.parse(raw) } : defaultGatewayConfig()
        this.hosts = this.gatewayConfig.hosts
      } catch {
        this.gatewayConfig = defaultGatewayConfig()
      }
    },

    persistConfig() {
      this.gatewayConfig = {
        version: 1,
        hosts: this.hosts,
        pinnedThreads: this.gatewayConfig.pinnedThreads,
        lastOpenThread: this.gatewayConfig.lastOpenThread ?? null,
      }
      if (import.meta.client) {
        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(this.gatewayConfig))
      }
    },

    async syncConfigToServer() {
      const config = await $fetch<GatewayConfig>('/api/config/sync', {
        method: 'POST',
        body: this.gatewayConfig,
      })
      this.gatewayConfig = {
        ...defaultGatewayConfig(),
        ...config,
        pinnedThreads: this.gatewayConfig.pinnedThreads.length ? this.gatewayConfig.pinnedThreads : config.pinnedThreads,
      }
      this.hosts = this.gatewayConfig.hosts
      this.persistConfig()
    },

    exportConfigText() {
      this.persistConfig()
      return JSON.stringify(this.gatewayConfig, null, 2)
    },

    async importConfigText(text: string) {
      const config = JSON.parse(text) as GatewayConfig
      this.gatewayConfig = {
        ...defaultGatewayConfig(),
        ...config,
        pinnedThreads: Array.isArray(config.pinnedThreads) ? config.pinnedThreads : [],
      }
      this.hosts = this.gatewayConfig.hosts
      this.projects = []
      this.persistConfig()
      await this.syncConfigToServer()
      await this.refresh()
    },

    async refresh() {
      this.initializing = true
      this.loading = true
      this.error = null
      try {
        this.hydrateConfig()
        this.projects = []
        this.threads = []
        await this.syncConfigToServer()
        const status = await $fetch<GatewayStatus>('/api/status')
        this.status = status

        if (!this.selectedHostId) {
          this.selectedHostId = this.hosts[0]?.id ?? null
        }

        await this.listThreads()
        this.ensureSelectedProject()
        if (this.selectedProjectId) {
          await this.listThreads()
        }
        if (this.gatewayConfig.lastOpenThread?.hostId) {
          await this.restoreLastOpenThread()
        }
      } catch (error: any) {
        this.error = error?.data?.message || error?.message || 'Failed to bootstrap gateway'
      } finally {
        this.loading = false
        this.initializing = false
      }
    },

    async createHost(input: Record<string, unknown>) {
      const host = await $fetch<HostRecord>('/api/hosts', { method: 'POST', body: input })
      this.hosts.push(host)
      this.persistConfig()
      this.selectedHostId = host.id
      this.selectedProjectId = null
      await this.listThreads()
      this.ensureSelectedProject()
      if (this.selectedProjectId) {
        await this.listThreads()
      }
      return host
    },

    async verifyHost(hostId: number) {
      return $fetch(`/api/hosts/${hostId}/verify`, { method: 'POST' })
    },

    async deleteHost(hostId: number) {
      await $fetch(`/api/hosts/${hostId}`, { method: 'DELETE' })
      this.hosts = this.hosts.filter((host) => host.id !== hostId)
      this.projects = this.projects.filter((project) => project.hostId !== hostId)
      this.gatewayConfig.pinnedThreads = this.gatewayConfig.pinnedThreads.filter((thread) => thread.hostId !== hostId)
      this.persistConfig()
      if (this.selectedHostId === hostId) {
        this.selectedHostId = this.hosts[0]?.id ?? null
        this.selectedProjectId = null
        this.selectedThreadId = null
        this.threads = []
        this.currentThread = null
        this.history = null
        this.events = []
        this.olderTurnsCursor = null
        this.newerTurnsCursor = null
        if (this.selectedHostId) {
          await this.listThreads()
        }
      }
    },

    async selectHost(hostId: number) {
      this.selectedHostId = hostId
      const currentProject = this.projects.find((project) => project.id === this.selectedProjectId)
      if (!currentProject || currentProject.hostId !== hostId) {
        this.selectedProjectId = null
      }
      this.selectedThreadId = null
      this.currentThread = null
      this.history = null
      this.events = []
      this.olderTurnsCursor = null
      this.newerTurnsCursor = null
      await this.listThreads()
      this.ensureSelectedProject()
      if (this.selectedProjectId) {
        await this.listThreads()
      }
    },

    async selectProject(projectId: number) {
      this.selectedProjectId = projectId
      this.selectedThreadId = null
      this.currentThread = null
      this.history = null
      this.events = []
      this.olderTurnsCursor = null
      this.newerTurnsCursor = null
      await this.listThreads()
    },

    async listRemoteDirectories(path = '~') {
      if (!this.selectedHostId) {
        return { path, entries: [] as RemoteDirectoryEntry[] }
      }

      return $fetch<{ path: string, entries: RemoteDirectoryEntry[] }>('/api/remote/directories', {
        query: {
          hostId: this.selectedHostId,
          path,
        },
      })
    },

    async createProject(input: Record<string, unknown>) {
      const project = await $fetch<ProjectRecord>('/api/projects', { method: 'POST', body: input })
      const index = this.projects.findIndex((item) => item.id === project.id)
      if (index >= 0) {
        this.projects[index] = project
      } else {
        this.projects.push(project)
      }
      this.persistConfig()
      this.selectedProjectId = project.id
      await this.listThreads()
      return project
    },

    async listThreads(searchTerm = '') {
      if (!this.selectedHostId) {
        return
      }

      this.loading = true
      this.error = null
      try {
        const project = this.selectedProject
        const query: Record<string, unknown> = {
          hostId: this.selectedHostId,
          limit: 50,
          useStateDbOnly: true,
        }
        if (this.selectedProjectId) {
          query.projectId = this.selectedProjectId
        }
        if (project?.remotePath) {
          query.cwd = project.remotePath
        }
        if (searchTerm) {
          query.searchTerm = searchTerm
        }
        const response = await $fetch<ThreadListResponse>('/api/threads', {
          query,
        })
        if (response.projects) {
          this.mergeProjects(response.projects)
        }
        this.threads = sortThreads(this.decorateThreads(response.data ?? []))
        this.persistConfig()
      } catch (error: any) {
        this.error = error?.data?.message || error?.message || 'Failed to list threads'
      } finally {
        this.loading = false
      }
    },

    mergeProjects(projects: ProjectRecord[]) {
      for (const project of projects) {
        const index = this.projects.findIndex((item) => item.id === project.id)
        if (index >= 0) {
          this.projects[index] = project
        } else {
          this.projects.push(project)
        }
      }
      this.persistConfig()
    },

    ensureSelectedProject() {
      if (!this.selectedHostId || this.selectedProjectId) {
        return
      }
      this.selectedProjectId = this.projects.find((project) => project.hostId === this.selectedHostId)?.id ?? null
    },

    decorateThreads(threads: any[]) {
      const pinned = new Set(this.gatewayConfig.pinnedThreads.map((thread) => pinnedKey(thread.hostId, thread.threadId)))
      return threads.map((thread) => ({
        ...thread,
        pinned: this.selectedHostId ? pinned.has(pinnedKey(this.selectedHostId, String(thread.id))) : false,
      }))
    },

    async openThread(threadId: string, context?: { hostId?: number, projectId?: number | null }) {
      if (context?.hostId && context.hostId !== this.selectedHostId) {
        this.selectedHostId = context.hostId
        this.selectedProjectId = context.projectId ?? null
        this.selectedThreadId = null
        this.currentThread = null
        this.history = null
        this.events = []
        this.olderTurnsCursor = null
        this.newerTurnsCursor = null
      } else if (context && 'projectId' in context && context.projectId !== this.selectedProjectId) {
        this.selectedProjectId = context.projectId ?? null
        this.selectedThreadId = null
        this.currentThread = null
        this.history = null
        this.events = []
        this.olderTurnsCursor = null
        this.newerTurnsCursor = null
      }
      if (!this.selectedHostId) {
        return
      }
      if (this.selectedThreadId === threadId && this.currentThread && this.history) {
        return
      }

      this.loading = true
      this.error = null
      try {
        const result = await $fetch<ThreadOpenResult>('/api/threads/open', {
          method: 'POST',
          body: {
            hostId: this.selectedHostId,
            projectId: this.selectedProjectId,
            threadId,
            limit: 20,
          },
        })
        this.selectedThreadId = threadId
        this.currentThread = result.thread
        this.history = result.history
        if (result.projectId) {
          this.selectedProjectId = result.projectId
        }
        if (result.project) {
          this.mergeProjects([result.project])
        }
        this.olderTurnsCursor = result.turnsPage.nextCursor
        this.newerTurnsCursor = result.turnsPage.backwardsCursor
        this.events = result.recentEvents
        this.lastEventId = result.recentEvents.at(-1)?.id ?? 0
        for (const event of result.recentEvents) {
          this.applyLiveEvent(event)
        }
        this.connectEvents()
        this.upsertPinnedMetadataFromThread(result.thread as any)
        this.gatewayConfig.lastOpenThread = {
          hostId: this.selectedHostId,
          projectId: this.selectedProjectId,
          threadId,
        }
        this.persistConfig()
      } catch (error: any) {
        this.error = error?.data?.message || error?.message || 'Failed to open thread'
      } finally {
        this.loading = false
      }
    },

    async restoreLastOpenThread() {
      const last = this.gatewayConfig.lastOpenThread
      if (!last) {
        return
      }
      if (!this.hosts.some((host) => host.id === last.hostId)) {
        return
      }
      await this.openThread(last.threadId, {
        hostId: last.hostId,
        projectId: last.projectId,
      })
    },

    async startThread(model?: string) {
      if (!this.selectedHostId) {
        return
      }
      const project = this.selectedProject
      const result = await $fetch<ThreadOpenResult>('/api/threads/start', {
        method: 'POST',
        body: {
          hostId: this.selectedHostId,
          projectId: this.selectedProjectId,
          cwd: project?.remotePath,
          model: model || undefined,
        },
      })
      const thread = result.thread as any
      this.currentThread = result.thread
      this.history = result.history
      this.events = result.recentEvents
      this.olderTurnsCursor = result.turnsPage.nextCursor
      this.newerTurnsCursor = result.turnsPage.backwardsCursor
      this.selectedThreadId = String(thread.id)
      this.connectEvents()
      await this.listThreads()
    },

    async setThreadPinned(threadId: string, pinned: boolean) {
      if (!this.selectedHostId) {
        return
      }
      const host = this.hosts.find((candidate) => candidate.id === this.selectedHostId)
      const project = this.projects.find((candidate) => candidate.id === this.selectedProjectId)
      const thread = this.threads.find((candidate) => String(candidate.id) === threadId)
      const key = pinnedKey(this.selectedHostId, threadId)
      this.gatewayConfig.pinnedThreads = this.gatewayConfig.pinnedThreads.filter((item) => pinnedKey(item.hostId, item.threadId) !== key)
      if (pinned && host) {
        this.gatewayConfig.pinnedThreads.unshift({
          hostId: this.selectedHostId,
          projectId: this.selectedProjectId,
          threadId,
          title: titleForThread(thread),
          subtitle: project?.remotePath ?? null,
          hostName: host.name,
          projectName: project?.name ?? null,
          updatedAt: Number(thread?.recencyAt || thread?.updatedAt || Math.floor(Date.now() / 1000)),
        })
      }
      this.persistConfig()
      this.threads = sortThreads(this.threads.map((thread) =>
        String(thread.id) === threadId ? { ...thread, pinned } : thread,
      ))
    },

    setPinnedThread(thread: PinnedThreadRecord, pinned: boolean) {
      const key = pinnedKey(thread.hostId, thread.threadId)
      this.gatewayConfig.pinnedThreads = this.gatewayConfig.pinnedThreads.filter((item) => pinnedKey(item.hostId, item.threadId) !== key)
      if (pinned) {
        this.gatewayConfig.pinnedThreads.unshift(thread)
      }
      this.persistConfig()
      if (thread.hostId === this.selectedHostId) {
        this.threads = sortThreads(this.threads.map((candidate) =>
          String(candidate.id) === thread.threadId ? { ...candidate, pinned } : candidate,
        ))
      }
    },

    async openPinnedThread(thread: PinnedThreadRecord) {
      const key = pinnedKey(thread.hostId, thread.threadId)
      this.openingPinnedThreadKey = key
      try {
        await this.openThread(thread.threadId, {
          hostId: thread.hostId,
          projectId: thread.projectId,
        })
      } finally {
        this.openingPinnedThreadKey = null
      }
    },

    upsertPinnedMetadataFromThread(thread: any) {
      if (!this.selectedHostId || !thread?.id) {
        return
      }
      const key = pinnedKey(this.selectedHostId, String(thread.id))
      const index = this.gatewayConfig.pinnedThreads.findIndex((item) => pinnedKey(item.hostId, item.threadId) === key)
      if (index < 0) {
        return
      }
      const host = this.hosts.find((candidate) => candidate.id === this.selectedHostId)
      const project = this.projects.find((candidate) => candidate.id === this.selectedProjectId)
      this.gatewayConfig.pinnedThreads[index] = {
        ...this.gatewayConfig.pinnedThreads[index],
        title: titleForThread(thread),
        hostName: host?.name || this.gatewayConfig.pinnedThreads[index].hostName,
        projectName: project?.name ?? this.gatewayConfig.pinnedThreads[index].projectName,
        subtitle: project?.remotePath ?? this.gatewayConfig.pinnedThreads[index].subtitle,
        updatedAt: Number(thread.recencyAt || thread.updatedAt || this.gatewayConfig.pinnedThreads[index].updatedAt || Math.floor(Date.now() / 1000)),
      }
      this.persistConfig()
    },

    async renameThread(threadId: string, name: string) {
      if (!this.selectedHostId) {
        return
      }
      await $fetch('/api/threads/rename', {
        method: 'POST',
        body: {
          hostId: this.selectedHostId,
          threadId,
          name,
        },
      })
      this.threads = this.threads.map((thread) =>
        String(thread.id) === threadId ? { ...thread, name } : thread,
      )
      if (this.selectedHostId) {
        const key = pinnedKey(this.selectedHostId, threadId)
        this.gatewayConfig.pinnedThreads = this.gatewayConfig.pinnedThreads.map((thread) =>
          pinnedKey(thread.hostId, thread.threadId) === key ? { ...thread, title: name } : thread,
        )
        this.persistConfig()
      }
      if (this.selectedThreadId === threadId && this.currentThread && typeof this.currentThread === 'object') {
        this.currentThread = { ...(this.currentThread as Record<string, unknown>), name }
      }
      await this.listThreads()
    },

    async sendTurn(text: string, images: Array<{ path: string, detail?: 'low' | 'high' | 'auto' | 'original' }> = []) {
      if (!this.selectedHostId || !this.selectedThreadId) {
        return
      }
      const clientUserMessageId = globalThis.crypto?.randomUUID?.() || `client-${Date.now()}`
      this.setThreadRunning(this.selectedHostId, this.selectedThreadId, true)
      this.history = mergeItemIntoLatestTurn(this.history, this.currentThread, this.selectedThreadId, {
        type: 'userMessage',
        id: clientUserMessageId,
        clientId: clientUserMessageId,
        content: [{ type: 'text', text, text_elements: [] }],
      })
      this.loading = true
      this.error = null
      try {
        const result = await $fetch<any>('/api/turns/start', {
          method: 'POST',
          body: {
            hostId: this.selectedHostId,
            threadId: this.selectedThreadId,
            text,
            clientUserMessageId,
            cwd: this.selectedProject?.remotePath,
            images,
          },
        })
        if (result?.turn?.items?.length) {
          for (const item of result.turn.items) {
            this.history = mergeItemIntoLatestTurn(this.history, this.currentThread, this.selectedThreadId, item)
          }
        }
      } catch (error: any) {
        this.error = error?.data?.message || error?.message || 'Failed to send message'
        this.setThreadRunning(this.selectedHostId, this.selectedThreadId, false)
      } finally {
        this.loading = false
      }
    },

    setThreadRunning(hostId: number, threadId: string, running: boolean) {
      const key = pinnedKey(hostId, threadId)
      const current = new Set(this.runningThreadKeys)
      if (running) {
        current.add(key)
      } else {
        current.delete(key)
      }
      this.runningThreadKeys = [...current]
    },

    async loadOlderTurns() {
      if (!this.selectedHostId || !this.selectedThreadId || !this.olderTurnsCursor || this.loadingOlderTurns) {
        return
      }

      this.loadingOlderTurns = true
      try {
        const result = await $fetch<ThreadTurnsPageResult>('/api/threads/turns', {
          query: {
            hostId: this.selectedHostId,
            threadId: this.selectedThreadId,
            cursor: this.olderTurnsCursor,
            limit: 20,
            sortDirection: 'desc',
          },
        })
        const turns = (result.history as any)?.thread?.turns ?? []
        this.history = mergeThreadTurns(this.history, this.currentThread, this.selectedThreadId, turns, 'prepend')
        this.olderTurnsCursor = result.turnsPage.nextCursor
        this.newerTurnsCursor = result.turnsPage.backwardsCursor ?? this.newerTurnsCursor
      } catch (error: any) {
        this.error = error?.data?.message || error?.message || 'Failed to load older turns'
      } finally {
        this.loadingOlderTurns = false
      }
    },

    connectEvents() {
      this.eventSource?.close()
      if (!this.selectedHostId || !this.selectedThreadId) {
        return
      }

      const url = `/api/events/${this.selectedHostId}/${encodeURIComponent(this.selectedThreadId)}?afterId=${this.lastEventId}`
      this.eventSource = new EventSource(url)
      this.eventSource.onmessage = (message) => {
        const event = JSON.parse(message.data) as GatewayEvent
        if (event.id <= this.lastEventId) {
          return
        }
        this.lastEventId = event.id
        this.events.push(event)
        if (this.events.length > 500) {
          this.events.shift()
        }
        this.applyLiveEvent(event)
      }
      this.eventSource.onerror = () => {
        this.error = 'SSE connection interrupted. The browser will retry automatically.'
      }
    },

    applyLiveEvent(event: GatewayEvent) {
      const payload = event.payload as any
      const params = payload?.params || {}
      if (event.method === 'thread/status/changed') {
        const threadId = params.threadId || params.thread_id
        if (threadId && event.hostId) {
          this.setThreadRunning(event.hostId, String(threadId), params.status?.type === 'active')
        }
      } else if (event.method === 'turn/completed') {
        const threadId = params.threadId || params.thread_id || this.selectedThreadId
        if (threadId && event.hostId) {
          this.setThreadRunning(event.hostId, String(threadId), false)
        }
      }

      if (!this.selectedThreadId) {
        return
      }
      if (params.threadId && String(params.threadId) !== this.selectedThreadId) {
        return
      }

      if ((event.method === 'item/started' || event.method === 'item/completed') && params.item) {
        this.history = mergeItemIntoLatestTurn(this.history, this.currentThread, this.selectedThreadId, {
          ...params.item,
          turnId: params.turnId,
        })
      } else if (event.method === 'item/agentMessage/delta') {
        this.history = appendAgentDelta(this.history, this.currentThread, this.selectedThreadId, params)
      } else if (event.method === 'item/commandExecution/outputDelta') {
        this.history = appendItemOutputDelta(this.history, this.currentThread, this.selectedThreadId, params, 'commandExecution')
      } else if (event.method === 'item/fileChange/outputDelta') {
        this.history = appendItemOutputDelta(this.history, this.currentThread, this.selectedThreadId, params, 'fileChange')
      } else if (event.method === 'item/fileChange/patchUpdated') {
        this.history = mergeItemIntoLatestTurn(this.history, this.currentThread, this.selectedThreadId, {
          type: 'fileChange',
          id: params.itemId,
          turnId: params.turnId,
          changes: params.changes ?? [],
          status: 'inProgress',
        })
      } else if (event.method === 'turn/diff/updated') {
        this.history = updateTurnDiff(this.history, this.currentThread, this.selectedThreadId, params)
      } else if (event.method === 'turn/started' && params.turn) {
        this.history = mergeThreadTurns(this.history, this.currentThread, this.selectedThreadId, [params.turn], 'append')
      } else if (event.method === 'turn/completed' && params.turn) {
        this.history = syncCompletedTurn(this.history, this.currentThread, this.selectedThreadId, params.turn)
      }
    },
  },
})
