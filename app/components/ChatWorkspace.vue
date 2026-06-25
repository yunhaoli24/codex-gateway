<script setup lang="ts">
import {
  CircleIcon,
  FolderIcon,
  ListRestartIcon,
  MoreHorizontalIcon,
  PinIcon,
  PlayIcon,
  PlusIcon,
  SendIcon,
  SettingsIcon,
  SquareIcon,
} from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { computed, nextTick, ref, watch } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import ProjectThreadList from '@/components/ProjectThreadList.vue'
import { useGatewayStore } from '@/stores/gateway'

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
  loading,
  error,
} = storeToRefs(store)

const model = ref('')
const turnText = ref('')
const scrollAreaRef = ref<HTMLElement | null>(null)

const threadTitle = computed(() => {
  if (!selectedThreadId.value && selectedProject.value) {
    return selectedProject.value.name
  }
  const thread = currentThread.value as any
  return thread?.name || thread?.preview || selectedThreadId.value || 'codex-gateway'
})

const historyTurns = computed(() => {
  const value = history.value as any
  return value?.thread?.turns || value?.turns || []
})

const threadItems = computed(() => {
  return historyTurns.value.flatMap((turn: any) => turn.items || [])
})

const visibleEvents = computed(() => events.value.filter((event) => shouldShowEvent(event.method)))
const activeEvents = computed(() => visibleEvents.value.slice(-8))

function eventLabel(method: string) {
  if (method.includes('command') || method.includes('process')) return t('app.runningCommand')
  if (method.includes('file') || method.includes('fs')) return t('app.readingFiles')
  if (method.includes('turn')) return method.replaceAll('/', ' ')
  return method
}

function shouldShowEvent(method: string) {
  return method.includes('command')
    || method.includes('process')
    || method.includes('file')
    || method.includes('fs')
    || method === 'turn/started'
    || method === 'turn/completed'
}

async function sendTurn() {
  const text = turnText.value.trim()
  if (!text) return
  turnText.value = ''
  await store.sendTurn(text)
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.key !== 'Enter' || event.shiftKey) {
    return
  }
  event.preventDefault()
  void sendTurn()
}

function scrollToBottom() {
  void nextTick(() => {
    const root = scrollAreaRef.value?.$el ?? scrollAreaRef.value
    const viewport = root?.querySelector?.('[data-slot="scroll-area-viewport"]') as HTMLElement | null
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight
    }
  })
}

watch(
  () => [selectedThreadId.value, threadItems.value.length, events.value.length],
  scrollToBottom,
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
        <Button data-testid="new-thread-button" variant="ghost" size="sm" :disabled="!selectedHostId" @click="store.startThread(model)">
          <PlayIcon class="size-4" />
          {{ t('app.newThread') }}
        </Button>
        <Badge variant="secondary">{{ status?.activeControllers.length || 0 }} {{ t('app.active') }}</Badge>
      </div>
    </header>

    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ScrollArea ref="scrollAreaRef" data-testid="chat-scroll-area" class="h-full min-h-0 flex-1 overflow-hidden">
        <div class="mx-auto flex min-h-[calc(100vh-260px)] max-w-[1020px] flex-col gap-8 px-8 py-12">
          <div v-if="threadItems.length" class="space-y-8">
            <ThreadItemView
              v-for="item in threadItems"
              :key="item.id || `${item.type}-${JSON.stringify(item).length}`"
              :item="item"
            />
          </div>
          <ProjectThreadList v-else-if="selectedProjectId && !selectedThreadId" />
          <div v-else class="ml-auto max-w-[760px] rounded-2xl bg-[#f1f1f1] px-5 py-4 text-[15px] leading-7 text-[#202225]">
            <div class="mb-2 flex items-center gap-2 text-[#7d858b]">
              <FolderIcon class="size-4" />
              {{ t('app.selectProjectFirst') }}
            </div>
            {{ t('app.noThread') }}
          </div>

          <div v-if="loading" class="max-w-[720px] text-[15px] text-[#a5a9ad]">
            {{ t('app.thinking') }}
          </div>

          <div v-if="error" class="mx-auto max-w-[760px] rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {{ error }}
          </div>
        </div>
      </ScrollArea>

      <div class="shrink-0 bg-gradient-to-t from-white via-white to-white/75 px-8 pb-5">
        <div class="mx-auto max-w-[760px]">
          <div v-if="activeEvents.length" class="mb-3 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-[#6f767d] shadow-sm">
            <CircleIcon class="size-3.5 text-sky-300" />
            {{ eventLabel(activeEvents.at(-1)?.method || '') }}
          </div>

          <div class="rounded-2xl border border-black/10 bg-white p-3 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
            <Textarea
              v-model="turnText"
              class="min-h-20 border-0 bg-transparent px-1 text-base shadow-none ring-0 focus-visible:ring-0"
              :placeholder="t('app.askFollowUp')"
              :disabled="!selectedThreadId"
              @keydown="handleComposerKeydown"
            />
            <div class="flex items-center justify-between pt-2">
              <div class="flex items-center gap-3 text-sm text-[#858b91]">
                <PlusIcon class="size-4" />
                <SettingsIcon class="size-4" />
                <span>{{ t('app.custom') }}</span>
              </div>
              <div class="flex items-center gap-4">
                <Input v-model="model" class="h-8 w-28 border-0 bg-transparent text-right text-sm" placeholder="5.5 High" />
                <Button
                  data-testid="send-turn-button"
                  class="size-9 rounded-full bg-[#171b1f] p-0 hover:bg-[#171b1f]/90"
                  :aria-label="t('app.send')"
                  :disabled="!selectedThreadId || !turnText.trim()"
                  @click="sendTurn"
                >
                  <SendIcon v-if="turnText.trim()" class="size-4" />
                  <SquareIcon v-else class="size-4 fill-white" />
                </Button>
              </div>
            </div>
          </div>
          <p class="mt-2 text-center text-xs text-[#9aa1a6]">
            {{ selectedThreadId ? t('app.ctrlEnter') : t('app.selectThreadFirst') }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
