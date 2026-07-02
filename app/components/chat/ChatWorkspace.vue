<script setup lang="ts">
import { useGatewayStore } from "@/stores/gateway";
import WorkspaceTabs from "./WorkspaceTabs.vue";
import { openWorkspaceTerminal, useChatWorkspaceState } from "./chat-workspace-state";

const store = useGatewayStore();
const {
  selectedHostId,
  selectedProjectId,
  selectedThreadId,
  status,
  initializing,
  loading,
  loadingOlderTurns,
  olderTurnsCursor,
  visibleSubAgentPanels,
  threadTitle,
  historyTurns,
  openingThread,
  visibleError,
  followKey,
  canOpenTerminal,
} = useChatWorkspaceState(store);

function loadOlderTurns() {
  void store.loadOlderTurns();
}

function openCurrentTerminal() {
  openWorkspaceTerminal(store);
}
</script>

<template>
  <section class="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-surface">
    <WorkspaceTabs
      :thread-title="threadTitle"
      :active-controller-count="status?.activeControllers.length || 0"
      :initializing="initializing"
      :opening-thread="Boolean(openingThread)"
      :selected-thread-id="selectedThreadId"
      :selected-project-id="selectedProjectId"
      :selected-host-id="selectedHostId"
      :history-turns="historyTurns"
      :loading="loading"
      :loading-older-turns="loadingOlderTurns"
      :older-turns-cursor="olderTurnsCursor"
      :visible-error="visibleError"
      :follow-key="followKey"
      :visible-sub-agent-panels="visibleSubAgentPanels"
      :can-open-terminal="canOpenTerminal"
      @load-older="loadOlderTurns"
      @open-terminal="openCurrentTerminal"
    >
      <template #mobile-header-start>
        <slot name="mobile-header-start" />
      </template>
    </WorkspaceTabs>
  </section>
</template>
