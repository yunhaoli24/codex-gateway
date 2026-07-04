<script setup lang="ts">
import ThreadRow from "./ThreadRow.vue";
import { formatRelative, pinnedThreadId, pinnedThreadKey } from "./sidebar-utils";

const props = defineProps<{
  threads: any[];
  hosts: any[];
  selectedHostId: number | null;
  selectedThreadId: string | null;
  renamingThreadId: string | null;
  renameValue: string;
  longPressHandlers?: Record<string, unknown>;
  runtimeStatus: (thread: any) => any;
  completionAttention: (thread: any) => boolean;
}>();

const emit = defineEmits<{
  open: [thread: any];
  unpin: [thread: any];
  rename: [thread: any];
  submitRename: [];
  renameKeydown: [event: KeyboardEvent];
  "update:renameValue": [value: string];
}>();

function subtitleForPinnedThread(thread: any) {
  const hostName = props.hosts.find((host) => host.id === thread.hostId)?.name;
  return [hostName, thread.projectName].filter(Boolean).join(" / ");
}

function isSelectedPinnedThread(thread: any) {
  return (
    pinnedThreadId(thread) === String(props.selectedThreadId) &&
    thread.hostId === props.selectedHostId
  );
}
</script>

<template>
  <section v-if="threads.length" class="flex flex-col">
    <div class="px-2 pb-2 text-sm text-ink-muted">{{ $t("app.pinned") }}</div>
    <div class="space-y-1">
      <ThreadRow
        v-for="thread in threads"
        :key="pinnedThreadKey(thread)"
        :thread="thread"
        :test-id="`pinned-thread-button-${pinnedThreadId(thread)}`"
        :selected="isSelectedPinnedThread(thread)"
        :status="runtimeStatus(thread)"
        :completion-attention="completionAttention(thread)"
        :subtitle="subtitleForPinnedThread(thread) || formatRelative(thread.updatedAt)"
        :rename-active="renamingThreadId === pinnedThreadId(thread)"
        :rename-value="renameValue"
        :pin-label="$t('app.unpinThread')"
        :long-press-handlers="longPressHandlers"
        show-pinned-icon
        @open="emit('open', thread)"
        @toggle-pin="emit('unpin', thread)"
        @rename="emit('rename', thread)"
        @submit-rename="emit('submitRename')"
        @rename-keydown="emit('renameKeydown', $event)"
        @update:rename-value="emit('update:renameValue', $event)"
      />
    </div>
  </section>
</template>
