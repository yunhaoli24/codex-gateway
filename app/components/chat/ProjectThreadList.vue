<script setup lang="ts">
import {
  Clock3Icon,
  FolderIcon,
  MessageSquareTextIcon,
  PlusIcon,
  RefreshCwIcon,
} from "@lucide/vue";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useLongPressContextMenu } from "@/composables/useLongPressContextMenu";
import { useGatewayStore } from "@/stores/gateway";
import { titleForThread } from "@/stores/gateway/thread-utils/identity";

const store = useGatewayStore();
const { t } = useI18n();
const {
  loading,
  selectedHostId,
  selectedProjectId,
  selectedProject,
  selectedThreadId,
  currentThread,
  threads,
} = storeToRefs(store);
const { longPressTriggered, longPressContextMenuHandlers } = useLongPressContextMenu();

const sortedThreads = computed(() => {
  return [...threads.value].sort(
    (a, b) => Number(b.recencyAt || b.updatedAt || 0) - Number(a.recencyAt || a.updatedAt || 0),
  );
});

function titleFor(thread: any) {
  if (String(thread.id) === String(selectedThreadId.value) && currentThread.value) {
    return titleForThread({ ...thread, ...(currentThread.value as Record<string, unknown>) });
  }
  return titleForThread(thread);
}

function formatDate(seconds?: number | null) {
  if (!seconds) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(seconds * 1000));
}

function openThread(threadId: string) {
  if (longPressTriggered.value) {
    return;
  }
  void store.openThread(threadId, {
    hostId: selectedHostId.value ?? undefined,
    projectId: selectedProjectId.value,
  });
}
</script>

<template>
  <section data-testid="project-thread-list" class="mx-auto w-full max-w-4xl">
    <div class="mb-8 flex items-start justify-between gap-4 border-b border-hairline pb-5">
      <div class="min-w-0">
        <div class="mb-2 flex items-center gap-2 text-sm text-ink-muted">
          <FolderIcon class="size-4" />
          {{ t("app.projectThreads") }}
        </div>
        <h2 class="truncate text-2xl font-semibold text-ink">{{ selectedProject?.name }}</h2>
        <p class="mt-2 truncate text-sm text-ink-muted">{{ selectedProject?.remotePath }}</p>
        <p class="mt-4 max-w-2xl text-[0.9375rem] leading-7 text-ink-secondary">
          {{ t("app.projectThreadsHint") }}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <Button variant="secondary" size="sm" :disabled="loading" @click="store.listThreads('')">
          <RefreshCwIcon class="size-4" />
          {{ t("app.refresh") }}
        </Button>
        <Button size="sm" @click="store.startThread('')">
          <PlusIcon class="size-4" />
          {{ t("app.newThread") }}
        </Button>
      </div>
    </div>

    <div v-if="sortedThreads.length" class="space-y-2">
      <ContextMenu v-for="thread in sortedThreads" :key="thread.id">
        <ContextMenuTrigger as-child>
          <Button
            variant="ghost"
            :data-testid="`project-thread-row-${thread.id}`"
            v-bind="longPressContextMenuHandlers"
            class="group h-auto w-full items-start justify-between gap-4 rounded-lg border border-transparent px-4 py-3 text-left font-normal hover:border-hairline hover:bg-canvas-soft"
            @click="openThread(String(thread.id))"
          >
            <span class="flex min-w-0 gap-3">
              <MessageSquareTextIcon class="mt-1 size-4 shrink-0 text-ink-muted" />
              <span class="min-w-0">
                <span class="line-clamp-2 text-[0.9375rem] leading-6 text-ink">{{
                  titleFor(thread)
                }}</span>
                <span class="mt-1 flex items-center gap-2 text-xs text-ink-faint">
                  <Clock3Icon class="size-3.5" />
                  {{ formatDate(thread.recencyAt || thread.updatedAt) }}
                </span>
              </span>
            </span>
            <Badge variant="secondary" class="opacity-0 transition-opacity group-hover:opacity-100">
              {{ t("app.openThread") }}
            </Badge>
          </Button>
        </ContextMenuTrigger>
        <ContextMenuContent class="w-40">
          <ContextMenuItem @select="store.setThreadPinned(String(thread.id), !thread.pinned)">
            {{ thread.pinned ? t("app.unpinThread") : t("app.pinThread") }}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>

    <div v-else class="rounded-2xl bg-canvas-soft px-5 py-4 text-[0.9375rem] leading-7 text-ink">
      {{ loading ? t("app.thinking") : t("app.noProjectThreads") }}
    </div>
  </section>
</template>
