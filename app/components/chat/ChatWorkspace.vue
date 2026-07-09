<script setup lang="ts">
import { useGatewayTerminalTransport } from "@/composables/useGatewayTerminalTransport";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayThreadTurnsStore } from "@/stores/gateway-thread-turns";
import WorkspaceTabs from "./WorkspaceTabs.vue";
import { openWorkspaceTerminal, useChatWorkspaceState } from "./chat-workspace-state";
import { useBackgroundTurnTopUp } from "./useBackgroundTurnTopUp";

withDefaults(
  defineProps<{
    layout?: "desktop" | "mobile";
  }>(),
  {
    layout: "desktop",
  },
);

const store = useGatewayStore();
const threadTurns = useGatewayThreadTurnsStore();
const terminalTransport = useGatewayTerminalTransport();
const {
  selectedHostId,
  selectedProjectId,
  selectedThreadId,
  selectedThreadStatus,
  initializing,
  loading,
  loadingOlderTurns,
  olderTurnsCursor,
  visibleSubAgentPanels,
  threadTitle,
  historyTurns,
  openingThread,
  selectedThreadViewReady,
  visibleError,
  followKey,
  canOpenTerminal,
} = useChatWorkspaceState(store);

function loadOlderTurns() {
  void threadTurns.loadOlderTurns();
}

function openCurrentTerminal() {
  openWorkspaceTerminal(store, terminalTransport);
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
      :thread-title="threadTitle"
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
      :visible-sub-agent-panels="visibleSubAgentPanels"
      :can-open-terminal="canOpenTerminal"
      :selected-thread-view-ready="selectedThreadViewReady"
      @load-older="loadOlderTurns"
      @open-terminal="openCurrentTerminal"
    >
      <template #mobile-header-start>
        <slot name="mobile-header-start" />
      </template>
    </WorkspaceTabs>
  </section>
</template>
