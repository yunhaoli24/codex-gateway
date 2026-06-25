import { defineStore } from 'pinia'
import type {
  GatewayEvent,
  GatewayStatus,
  HostRecord,
  ProjectRecord,
  RemoteDirectoryEntry,
  ThreadOpenResult,
} from '~~/shared/types'

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

  let turn = item.turnId ? turns.find((candidate: any) => candidate?.id === item.turnId) : null
  if (!turn) {
    turn = turns.at(-1)
  }
  if (!turn || !Array.isArray(turn.items)) {
    turn = { id: item.turnId || `live-${Date.now()}`, items: [], status: 'inProgress' }
    turns.push(turn)
  } else {
    turn.items = [...turn.items]
  }

  const index = turn.items.findIndex((candidate: any) => sameItem(candidate, item))
  if (index >= 0) {
    turn.items[index] = { ...turn.items[index], ...item }
  } else {
    turn.items.push(item)
  }
  nextHistory.thread.turns = [...turns.slice(0, -1), turn]
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
  let turn = params.turnId ? turns.find((candidate: any) => candidate?.id === params.turnId) : null
  if (!turn) {
    turn = turns.at(-1)
  }
  if (!turn || !Array.isArray(turn.items)) {
    turn = { id: params.turnId || `live-${Date.now()}`, items: [], status: 'inProgress' }
    turns.push(turn)
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
  nextHistory.thread.turns = [...turns.slice(0, -1), turn]
  return nextHistory
}

export const useGatewayStore = defineStore('gateway', {
  state: () => ({
    hosts: [] as HostRecord[],
    projects: [] as ProjectRecord[],
    threads: [] as Array<any>,
    selectedHostId: null as number | null,
    selectedProjectId: null as number | null,
    selectedThreadId: null as string | null,
    currentThread: null as unknown,
    history: null as unknown,
    events: [] as GatewayEvent[],
    status: null as GatewayStatus | null,
    loading: false,
    error: null as string | null,
    eventSource: null as EventSource | null,
    lastEventId: 0,
    historyRefreshTimer: null as ReturnType<typeof setTimeout> | null,
  }),

  getters: {
    selectedHost(state) {
      return state.hosts.find((host) => host.id === state.selectedHostId) ?? null
    },

    selectedProject(state) {
      return state.projects.find((project) => project.id === state.selectedProjectId) ?? null
    },
  },

  actions: {
    async refresh() {
      const [bootstrap, status] = await Promise.all([
        $fetch<{ host: HostRecord, hosts: HostRecord[], projects: ProjectRecord[] }>('/api/bootstrap', { method: 'POST' }),
        $fetch<GatewayStatus>('/api/status'),
      ])
      this.hosts = bootstrap.hosts
      this.projects = bootstrap.projects
      this.status = status

      if (!this.selectedHostId) {
        this.selectedHostId = this.hosts.find((host) => host.appServerMode !== 'local')?.id ?? bootstrap.host.id
      }

      await this.listThreads()
      this.ensureSelectedProject()
      if (this.selectedProjectId) {
        await this.listThreads()
      }
    },

    async createHost(input: Record<string, unknown>) {
      const host = await $fetch<HostRecord>('/api/hosts', { method: 'POST', body: input })
      this.hosts.push(host)
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
      if (this.selectedHostId === hostId) {
        this.selectedHostId = this.hosts[0]?.id ?? null
        this.selectedProjectId = null
        this.selectedThreadId = null
        this.threads = []
        this.currentThread = null
        this.history = null
        this.events = []
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
        this.threads = response.data ?? []
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
    },

    ensureSelectedProject() {
      if (!this.selectedHostId || this.selectedProjectId) {
        return
      }
      this.selectedProjectId = this.projects.find((project) => project.hostId === this.selectedHostId)?.id ?? null
    },

    async openThread(threadId: string) {
      if (!this.selectedHostId) {
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
          },
        })
        this.selectedThreadId = threadId
        this.currentThread = result.thread
        this.history = result.history
        this.events = result.recentEvents
        this.lastEventId = result.recentEvents.at(-1)?.id ?? 0
        this.connectEvents()
      } catch (error: any) {
        this.error = error?.data?.message || error?.message || 'Failed to open thread'
      } finally {
        this.loading = false
      }
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
      this.selectedThreadId = String(thread.id)
      this.connectEvents()
      await this.listThreads()
    },

    async sendTurn(text: string) {
      if (!this.selectedHostId || !this.selectedThreadId) {
        return
      }
      const clientUserMessageId = globalThis.crypto?.randomUUID?.() || `client-${Date.now()}`
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
          },
        })
        if (result?.turn?.items?.length) {
          for (const item of result.turn.items) {
            this.history = mergeItemIntoLatestTurn(this.history, this.currentThread, this.selectedThreadId, item)
          }
        }
      } catch (error: any) {
        this.error = error?.data?.message || error?.message || 'Failed to send message'
      } finally {
        this.loading = false
      }
    },

    async refreshCurrentThreadHistory() {
      if (!this.selectedHostId || !this.selectedThreadId) {
        return
      }

      try {
        this.history = await $fetch('/api/threads/read', {
          query: {
            hostId: this.selectedHostId,
            threadId: this.selectedThreadId,
          },
        })
      } catch (error: any) {
        this.error = error?.data?.message || error?.message || 'Failed to refresh thread history'
      }
    },

    scheduleHistoryRefresh() {
      if (this.historyRefreshTimer) {
        clearTimeout(this.historyRefreshTimer)
      }
      this.historyRefreshTimer = setTimeout(() => {
        this.historyRefreshTimer = null
        void this.refreshCurrentThreadHistory()
      }, 250)
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
        if (event.method === 'turn/completed') {
          this.scheduleHistoryRefresh()
        }
      }
      this.eventSource.onerror = () => {
        this.error = 'SSE connection interrupted. The browser will retry automatically.'
      }
    },

    applyLiveEvent(event: GatewayEvent) {
      if (!this.selectedThreadId) {
        return
      }

      const payload = event.payload as any
      const params = payload?.params || {}
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
      }
    },
  },
})
