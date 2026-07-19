<script setup lang="ts">
import type { ThreadRuntimeStatus } from "~~/shared/types";
import WorkspaceDock from "./workspace-dock/WorkspaceDock.vue";

const props = defineProps<{
  layout: "desktop" | "mobile";
  initializing: boolean;
  openingThread: boolean;
  selectedThreadId: string | null;
  selectedThreadStatus: ThreadRuntimeStatus;
  selectedProjectId: number | null;
  selectedHostId: number | null;
  historyTurns: any[];
  loading: boolean;
  loadingOlderTurns: boolean;
  olderTurnsCursor: string | null;
  visibleError: string | null;
  followKey: unknown[];
  canOpenTerminal: boolean;
  selectedThreadViewReady: boolean;
}>();
const emit = defineEmits<{ loadOlder: []; openTerminal: [] }>();
</script>

<template>
  <WorkspaceDock
    v-bind="props"
    @load-older="emit('loadOlder')"
    @open-terminal="emit('openTerminal')"
  >
    <template #mobile-header-start><slot name="mobile-header-start" /></template>
  </WorkspaceDock>
</template>
