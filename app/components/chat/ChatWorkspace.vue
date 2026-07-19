<script setup lang="ts">
import { useWorkspaceLaunchActions } from "@/composables/workspace/useWorkspaceLaunchActions";
import { useGatewayThreadTurnsStore } from "@/stores/gateway-thread-turns";
import WorkspaceTabs from "./WorkspaceTabs.vue";
import { useChatWorkspaceState } from "./chat-workspace-state";
import { useBackgroundTurnTopUp } from "./useBackgroundTurnTopUp";

withDefaults(
  defineProps<{
    layout?: "desktop" | "mobile";
  }>(),
  {
    layout: "desktop",
  },
);

const threadTurns = useGatewayThreadTurnsStore();
const workspaceActions = useWorkspaceLaunchActions();
const {
  selectedHostId,
  selectedProjectId,
  selectedThreadId,
  selectedThreadStatus,
  initializing,
  loading,
  loadingOlderTurns,
  olderTurnsCursor,
  historyTurns,
  openingThread,
  selectedThreadViewReady,
  visibleError,
  followKey,
  canOpenTerminal,
} = useChatWorkspaceState();

function loadOlderTurns() {
  void threadTurns.loadOlderTurns();
}

useBackgroundTurnTopUp({
  selectedHostId,
  selectedThreadId,
  selectedThreadViewReady,
  loading,
  loadingOlderTurns,
  olderTurnsCursor,
  historyTurns,
  loadOlderTurns: (options) => {
    void threadTurns.loadOlderTurns(options);
  },
});
</script>

<template>
  <section class="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-surface">
    <WorkspaceTabs
      :layout="layout"
      :initializing="initializing"
      :opening-thread="Boolean(openingThread)"
      :selected-thread-id="selectedThreadId"
      :selected-thread-status="selectedThreadStatus"
      :selected-project-id="selectedProjectId"
      :selected-host-id="selectedHostId"
      :history-turns="historyTurns"
      :loading="loading"
      :loading-older-turns="loadingOlderTurns"
      :older-turns-cursor="olderTurnsCursor"
      :visible-error="visibleError"
      :follow-key="followKey"
      :can-open-terminal="canOpenTerminal"
      :selected-thread-view-ready="selectedThreadViewReady"
      @load-older="loadOlderTurns"
      @open-terminal="workspaceActions.openTerminal"
    >
      <template #mobile-header-start>
        <slot name="mobile-header-start" />
      </template>
    </WorkspaceTabs>
  </section>
</template>
