<script setup lang="ts">
import { Clock3Icon, FolderIcon, MessageSquareTextIcon, PlusIcon, RefreshCwIcon } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useGatewayStore } from '@/stores/gateway'
import { titleForThread } from '@/stores/gateway/thread-utils'

const store = useGatewayStore()
const { t } = useI18n()
const { loading, selectedHostId, selectedProjectId, selectedProject, selectedThreadId, currentThread, threads } = storeToRefs(store)

const sortedThreads = computed(() => {
  return [...threads.value].sort((a, b) => Number(b.recencyAt || b.updatedAt || 0) - Number(a.recencyAt || a.updatedAt || 0))
})

function titleFor(thread: any) {
  if (String(thread.id) === String(selectedThreadId.value) && currentThread.value) {
    return titleForThread({ ...thread, ...(currentThread.value as Record<string, unknown>) })
  }
  return titleForThread(thread)
}

function formatDate(seconds?: number | null) {
  if (!seconds) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(seconds * 1000))
}

function openThread(threadId: string) {
  void store.openThread(threadId, {
    hostId: selectedHostId.value ?? undefined,
    projectId: selectedProjectId.value,
  })
}
</script>

<template>
  <section data-testid="project-thread-list" class="mx-auto w-full max-w-5xl">
    <div class="mb-8 flex items-start justify-between gap-4 border-b border-black/10 pb-5">
      <div class="min-w-0">
        <div class="mb-2 flex items-center gap-2 text-sm text-[#7d858b]">
          <FolderIcon class="size-4" />
          {{ t('app.projectThreads') }}
        </div>
        <h2 class="truncate text-2xl font-semibold text-[#202225]">{{ selectedProject?.name }}</h2>
        <p class="mt-2 truncate text-sm text-[#7d858b]">{{ selectedProject?.remotePath }}</p>
        <p class="mt-4 max-w-2xl text-[0.9375rem] leading-7 text-[#6f767d]">{{ t('app.projectThreadsHint') }}</p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <Button variant="secondary" size="sm" :disabled="loading" @click="store.listThreads('')">
          <RefreshCwIcon class="size-4" />
          {{ t('app.refresh') }}
        </Button>
        <Button size="sm" @click="store.startThread('')">
          <PlusIcon class="size-4" />
          {{ t('app.newThread') }}
        </Button>
      </div>
    </div>

    <div v-if="sortedThreads.length" class="space-y-2">
      <Button
        v-for="thread in sortedThreads"
        :key="thread.id"
        variant="ghost"
        :data-testid="`project-thread-row-${thread.id}`"
        class="group h-auto w-full items-start justify-between gap-4 rounded-lg border border-transparent px-4 py-3 text-left font-normal hover:border-black/10 hover:bg-[#f7fafb]"
        @click="openThread(String(thread.id))"
      >
        <span class="flex min-w-0 gap-3">
          <MessageSquareTextIcon class="mt-1 size-4 shrink-0 text-[#7d858b]" />
          <span class="min-w-0">
            <span class="line-clamp-2 text-[0.9375rem] leading-6 text-[#202225]">{{ titleFor(thread) }}</span>
            <span class="mt-1 flex items-center gap-2 text-xs text-[#8d9499]">
              <Clock3Icon class="size-3.5" />
              {{ formatDate(thread.recencyAt || thread.updatedAt) }}
            </span>
          </span>
        </span>
        <Badge variant="secondary" class="opacity-0 transition-opacity group-hover:opacity-100">
          {{ t('app.openThread') }}
        </Badge>
      </Button>
    </div>

    <div v-else class="rounded-2xl bg-[#f1f1f1] px-5 py-4 text-[0.9375rem] leading-7 text-[#202225]">
      {{ loading ? t('app.thinking') : t('app.noProjectThreads') }}
    </div>
  </section>
</template>
