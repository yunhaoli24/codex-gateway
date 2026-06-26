<script setup lang="ts">
import {
  FolderIcon,
  ListRestartIcon,
  MoreHorizontalIcon,
  PinIcon,
  PlayIcon,
} from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { computed, nextTick, ref, watch } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import ChatComposer from '@/components/chat/ChatComposer.vue'
import ProjectThreadList from '@/components/chat/ProjectThreadList.vue'
import LanguageSwitcher from '@/components/common/LanguageSwitcher.vue'
import ThreadTurnView from '@/components/thread/ThreadTurnView.vue'
import { useGatewayStore } from '@/stores/gateway'
import { titleForThread } from '@/stores/gateway/thread-utils'

const store = useGatewayStore()
const { t } = useI18n()
const {
  selectedHostId,
  selectedProjectId,
  selectedThreadId,
  selectedProject,
  currentThread,
  history,
  events,
  status,
  initializing,
  loading,
  loadingOlderTurns,
  olderTurnsCursor,
  error,
  scrollToLatestToken,
  defaultModel,
} = storeToRefs(store)

const scrollAreaRef = ref<any>(null)
const followLatest = ref(true)

const threadTitle = computed(() => {
  if (!selectedThreadId.value && selectedProject.value) {
    return selectedProject.value.name
  }
  const thread = currentThread.value as any
  return titleForThread(thread || { id: selectedThreadId.value }) || 'codex-gateway'
})

const historyTurns = computed(() => {
  const value = history.value as any
  return value?.thread?.turns || value?.turns || []
})

const threadItems = computed(() => {
  return historyTurns.value.flatMap((turn: any) => turn.items || [])
})
const outputSignature = computed(() => {
  return threadItems.value
    .filter((item: any) => item?.type === 'commandExecution' || item?.type === 'fileChange')
    .map((item: any) => `${item.id || ''}:${item.aggregatedOutput?.length || 0}:${item.status || ''}`)
    .join('|')
})

function scrollViewport() {
  const root = scrollAreaRef.value?.$el ?? scrollAreaRef.value
  return root?.querySelector?.('[data-slot="scroll-area-viewport"]') as HTMLElement | null
}

function isNearBottom(viewport: HTMLElement) {
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 120
}

async function scrollToBottom() {
  await nextTick()
  const scroll = () => {
    const viewport = scrollViewport()
    if (!viewport) return
    viewport.scrollTop = viewport.scrollHeight
  }
  scroll()
  requestAnimationFrame(() => {
    scroll()
    requestAnimationFrame(() => {
      scroll()
      window.setTimeout(scroll, 80)
      window.setTimeout(scroll, 250)
    })
  })
}

async function loadOlderTurns() {
  const viewport = scrollViewport()
  const previousHeight = viewport?.scrollHeight ?? 0
  await store.loadOlderTurns()
  await nextTick()
  if (viewport) {
    viewport.scrollTop += viewport.scrollHeight - previousHeight
  }
}

function handleScroll(event: Event) {
  const viewport = event.target as HTMLElement
  followLatest.value = isNearBottom(viewport)
  if (viewport.scrollTop <= 80 && olderTurnsCursor.value && !loadingOlderTurns.value) {
    void loadOlderTurns()
  }
}

watch(
  () => [selectedThreadId.value, scrollToLatestToken.value],
  () => {
    followLatest.value = true
    void scrollToBottom()
  },
  { flush: 'post' },
)

watch(
  () => [threadItems.value.length, events.value.length, outputSignature.value],
  () => {
    if (followLatest.value) {
      void scrollToBottom()
    }
  },
  { flush: 'post' },
)
</script>

<template>
  <section class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white">
    <header class="flex h-[62px] shrink-0 items-center justify-between border-b border-black/10 px-6">
      <div class="flex min-w-0 items-center gap-3">
        <PinIcon class="size-4 text-[#7d858b]" />
        <h1 class="truncate text-[15px] font-semibold">{{ threadTitle }}</h1>
        <MoreHorizontalIcon class="size-4 text-[#9aa1a6]" />
      </div>
      <div class="flex items-center gap-2 text-[#7d858b]">
        <LanguageSwitcher />
        <Button data-testid="refresh-threads-button" variant="ghost" size="sm" :aria-label="t('app.refresh')" @click="store.listThreads('')">
          <ListRestartIcon class="size-4" />
        </Button>
        <Button data-testid="new-thread-button" variant="ghost" size="sm" :disabled="!selectedProjectId" @click="store.startThread({ model: defaultModel?.model || defaultModel?.id || undefined })">
          <PlayIcon class="size-4" />
          {{ t('app.newThread') }}
        </Button>
        <Badge variant="secondary">{{ status?.activeControllers.length || 0 }} {{ t('app.active') }}</Badge>
      </div>
    </header>

    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ScrollArea ref="scrollAreaRef" data-testid="chat-scroll-area" class="h-full min-h-0 flex-1 overflow-hidden" @scroll.capture="handleScroll">
        <div class="mx-auto flex min-h-[calc(100vh-260px)] max-w-[1020px] flex-col gap-8 px-8 py-12">
          <div v-if="!initializing && selectedThreadId && olderTurnsCursor" class="flex justify-center">
            <Button data-testid="load-older-turns-button" variant="outline" size="sm" :disabled="loadingOlderTurns" @click="loadOlderTurns">
              {{ loadingOlderTurns ? t('app.loadingOlder') : t('app.loadOlder') }}
            </Button>
          </div>

          <div v-if="initializing" class="mx-auto flex min-h-[320px] max-w-[760px] items-center justify-center text-[15px] text-[#7d858b]">
            {{ t('app.loadingGateway') }}
          </div>

          <div v-else-if="historyTurns.length" class="space-y-8">
            <ThreadTurnView
              v-for="turn in historyTurns"
              :key="turn.id || `turn-${JSON.stringify(turn).length}`"
              :turn="turn"
              :host-id="selectedHostId"
            />
          </div>
          <ProjectThreadList v-else-if="selectedProjectId && !selectedThreadId" />
          <div v-else class="ml-auto max-w-[760px] rounded-2xl bg-[#f1f1f1] px-5 py-4 text-[15px] leading-7 text-[#202225]">
            <div class="mb-2 flex items-center gap-2 text-[#7d858b]">
              <FolderIcon class="size-4" />
              {{ selectedProjectId ? t('app.selectThreadFirst') : t('app.selectProjectFirst') }}
            </div>
            {{ selectedProjectId ? t('app.noThread') : t('app.chooseProject') }}
          </div>

          <div v-if="loading && !initializing && selectedThreadId" class="max-w-[720px] text-[15px] text-[#a5a9ad]">
            {{ t('app.thinking') }}
          </div>

          <div v-if="error" class="mx-auto max-w-[760px] rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {{ error }}
          </div>
        </div>
      </ScrollArea>

      <ChatComposer v-if="selectedThreadId" />
    </div>
  </section>
</template>
