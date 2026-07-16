<script setup lang="ts">
import AgentWorkspacePane from "../AgentWorkspacePane.vue";
import { requireWorkspaceAgentPanelContext } from "./context";

const context = requireWorkspaceAgentPanelContext();
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden">
    <AgentWorkspacePane
      :initializing="context.initializing.value"
      :opening-thread="context.openingThread.value"
      :selected-thread-id="context.selectedThreadId.value"
      :selected-thread-status="context.selectedThreadStatus.value"
      :selected-project-id="context.selectedProjectId.value"
      :selected-host-id="context.selectedHostId.value"
      :history-turns="context.historyTurns.value"
      :loading="context.loading.value"
      :loading-older-turns="context.loadingOlderTurns.value"
      :older-turns-cursor="context.olderTurnsCursor.value"
      :visible-error="context.visibleError.value"
      :follow-key="context.followKey.value"
      :selected-thread-view-ready="context.selectedThreadViewReady.value"
      @load-older="context.loadOlder"
    />
  </div>
</template>
