<script setup lang="ts">
import { computed } from "vue";
import type { ThreadRuntimeStatus } from "~~/shared/types";
import type { SubAgentPanelState } from "@/stores/gateway/types";
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
  visibleSubAgentPanels: SubAgentPanelState[];
  canOpenTerminal: boolean;
  selectedThreadViewReady: boolean;
}>();
const emit = defineEmits<{ loadOlder: []; openTerminal: [] }>();
const scopeKey = computed(
  () =>
    `${props.selectedHostId ?? "host"}:${props.selectedProjectId ?? "project"}:${props.selectedThreadId ?? "thread"}`,
);
</script>

<template>
  <WorkspaceDock
    :key="scopeKey"
    v-bind="props"
    @load-older="emit('loadOlder')"
    @open-terminal="emit('openTerminal')"
  >
    <template #mobile-header-start><slot name="mobile-header-start" /></template>
  </WorkspaceDock>
</template>
