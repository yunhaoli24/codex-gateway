<script setup lang="ts">
import ThreadRow from "./ThreadRow.vue";
import { formatRelative, threadKey } from "./sidebar-utils";
import type { ThreadActivitySummary } from "@/stores/gateway-thread-activity";
import type { ThreadRuntimeStatus } from "@/stores/gateway";

type RecentThread = ThreadActivitySummary & {
  id: string;
  hostName: string | null;
  status: ThreadRuntimeStatus;
  completionAttention: boolean;
};

defineProps<{
  threads: RecentThread[];
  selectedHostId: number | null;
  selectedThreadId: string | null;
  renamingThreadKey: string | null;
  renameValue: string;
  longPressHandlers?: Record<string, unknown>;
}>();

const emit = defineEmits<{
  open: [thread: RecentThread];
  pin: [thread: RecentThread];
  rename: [thread: RecentThread];
  submitRename: [];
  renameKeydown: [event: KeyboardEvent];
  "update:renameValue": [value: string];
}>();

function subtitle(thread: RecentThread) {
  return (
    [thread.hostName, thread.projectName].filter(Boolean).join(" / ") ||
    formatRelative(thread.updatedAt)
  );
}
</script>

<template>
  <section v-if="threads.length" class="flex min-w-0 max-w-full flex-col overflow-hidden">
    <div class="flex h-8 items-center px-2 pb-2 text-sm text-ink-muted">
      {{ $t("app.recentlyRunning") }}
    </div>
    <div class="space-y-1">
      <ThreadRow
        v-for="thread in threads"
        :key="threadKey(thread.hostId, thread.threadId)"
        :thread="thread"
        :test-id="`recent-thread-button-${thread.threadId}`"
        :selected="thread.hostId === selectedHostId && thread.threadId === selectedThreadId"
        :status="thread.status"
        :completion-attention="thread.completionAttention"
        :subtitle="subtitle(thread)"
        :rename-active="renamingThreadKey === threadKey(thread.hostId, thread.threadId)"
        :rename-value="renameValue"
        :pin-label="$t('app.pinThread')"
        :long-press-handlers="longPressHandlers"
        @open="emit('open', thread)"
        @toggle-pin="emit('pin', thread)"
        @rename="emit('rename', thread)"
        @submit-rename="emit('submitRename')"
        @rename-keydown="emit('renameKeydown', $event)"
        @update:rename-value="emit('update:renameValue', $event)"
      />
    </div>
  </section>
</template>
