<script setup lang="ts">
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  Clock3Icon,
  FolderIcon,
  GripIcon,
  LayoutPanelLeftIcon,
  PencilIcon,
  SearchIcon,
  SettingsIcon,
} from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useGatewayStore } from '@/stores/gateway'

const store = useGatewayStore()
const { t } = useI18n()
const { threads, projects, selectedHostId, selectedProjectId, selectedThreadId } = storeToRefs(store)
const showSettings = ref(false)

const visibleProjects = computed(() => projects.value.filter((project) => project.hostId === selectedHostId.value))
const projectThreads = computed(() => threads.value.slice(0, 20))

function formatRelative(seconds?: number | null) {
  if (!seconds) return ''
  const diff = Math.max(1, Math.floor(Date.now() / 1000 - seconds))
  if (diff < 3600) return `${Math.floor(diff / 60) || 1}m`
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604_800) return `${Math.floor(diff / 86_400)}d`
  return `${Math.floor(diff / 604_800)}w`
}

function openThread(threadId: string) {
  void store.openThread(threadId)
}

function selectProject(projectId: number) {
  void store.selectProject(projectId)
}
</script>

<template>
  <aside class="flex min-h-0 flex-col border-r border-black/10 bg-[#dcecf4]">
    <div class="flex h-[62px] shrink-0 items-center gap-4 px-5 text-[#60676c]">
      <div class="flex gap-2">
        <span class="size-3.5 rounded-full bg-[#ff605c]" />
        <span class="size-3.5 rounded-full bg-[#ffbd44]" />
        <span class="size-3.5 rounded-full bg-[#00ca4e]" />
      </div>
      <LayoutPanelLeftIcon class="size-4" />
      <ArrowLeftIcon class="size-4" />
      <ArrowRightIcon class="size-4 opacity-40" />
    </div>

    <nav class="shrink-0 space-y-1 px-4 pb-5 text-[15px]">
      <Button variant="ghost" class="h-10 w-full justify-start gap-3 px-2 text-[15px] font-normal hover:bg-black/5">
        <PencilIcon class="size-4" />
        {{ t('app.newChat') }}
      </Button>
      <Button variant="ghost" class="h-10 w-full justify-start gap-3 px-2 text-[15px] font-normal hover:bg-black/5" @click="store.listThreads('')">
        <SearchIcon class="size-4" />
        {{ t('app.search') }}
      </Button>
      <Button variant="ghost" class="h-10 w-full justify-start gap-3 px-2 text-[15px] font-normal hover:bg-black/5">
        <GripIcon class="size-4" />
        {{ t('app.plugins') }}
      </Button>
      <Button variant="ghost" class="h-10 w-full justify-start gap-3 px-2 text-[15px] font-normal hover:bg-black/5">
        <Clock3Icon class="size-4" />
        {{ t('app.automations') }}
      </Button>
    </nav>

    <ScrollArea class="min-h-0 flex-1 px-3">
      <div class="space-y-5 pb-4">
        <section>
          <div class="px-2 pb-2 text-sm text-[#8c969c]">{{ t('app.projects') }}</div>
          <Button
            v-for="project in visibleProjects"
            :key="project.id"
            :data-testid="`project-button-${project.id}`"
            variant="ghost"
            class="h-10 w-full justify-between rounded-lg px-3 text-[15px] font-normal hover:bg-black/5"
            :class="project.id === selectedProjectId ? 'bg-[#c7ddeb]' : ''"
            @click="selectProject(project.id)"
          >
            <span class="flex min-w-0 items-center gap-2">
              <FolderIcon class="size-4 shrink-0" />
              <span class="truncate">{{ project.name }}</span>
            </span>
            <span class="size-2 rounded-full bg-emerald-500" />
          </Button>
          <div v-if="!visibleProjects.length" class="rounded-lg px-3 py-2 text-xs text-[#8c969c]">
            {{ t('app.noProjects') }}
          </div>
        </section>

        <section>
          <div class="px-2 pb-2 text-sm text-[#8c969c]">{{ t('app.threadList') }}</div>
          <Button
            v-for="thread in projectThreads"
            :key="thread.id"
            :data-testid="`thread-button-${thread.id}`"
            variant="ghost"
            class="h-auto min-h-10 w-full justify-between rounded-lg px-3 py-2 text-[15px] font-normal hover:bg-black/5"
            :class="thread.id === selectedThreadId ? 'bg-[#c7ddeb]' : ''"
            @click="openThread(String(thread.id))"
          >
            <span class="min-w-0 text-left">
              <span class="block truncate">{{ thread.name || thread.preview || thread.id }}</span>
              <span class="block truncate text-xs text-[#7e878d]">{{ formatRelative(thread.updatedAt) }}</span>
            </span>
          </Button>
          <div v-if="!projectThreads.length" class="rounded-lg px-3 py-2 text-xs leading-5 text-[#8c969c]">
            <div>{{ selectedProjectId ? t('app.noThreads') : t('app.selectProjectFirst') }}</div>
            <div>{{ t('app.refreshThreadsHint') }}</div>
          </div>
        </section>
      </div>
    </ScrollArea>

    <div class="shrink-0 space-y-2 border-t border-black/10 p-3">
      <Button data-testid="settings-toggle" variant="ghost" class="h-10 w-full justify-start gap-3 rounded-lg px-3 text-[15px] font-normal hover:bg-black/5" @click="showSettings = !showSettings">
        <SettingsIcon class="size-4" />
        {{ t('app.settings') }}
      </Button>
      <SettingsPanel v-if="showSettings" />
    </div>
  </aside>
</template>
