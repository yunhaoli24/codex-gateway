<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, watchEffect } from "vue";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import TerminalPanel from "@/components/terminal/TerminalPanel.vue";
import { useGatewayStore } from "@/stores/gateway";
import type { TerminalSessionState } from "@/stores/gateway/types";
import AgentWorkspacePane from "./AgentWorkspacePane.vue";
import WorkspaceHeader from "./WorkspaceHeader.vue";

const props = defineProps<{
  threadTitle: string;
  initializing: boolean;
  openingThread: boolean;
  selectedThreadId: string | null;
  selectedProjectId: number | null;
  selectedHostId: number | null;
  historyTurns: any[];
  loading: boolean;
  loadingOlderTurns: boolean;
  olderTurnsCursor: string | null;
  visibleError: string | null;
  followKey: unknown[];
  visibleSubAgentPanels: any[];
  canOpenTerminal: boolean;
  selectedThreadViewReady: boolean;
}>();

const emit = defineEmits<{
  loadOlder: [];
  openTerminal: [];
}>();

const store = useGatewayStore();
const { workspaceTabs, activeWorkspaceTabId, terminalSessions } = storeToRefs(store);
const activeTab = computed({
  get: () => activeWorkspaceTabId.value,
  set: (value) => store.setActiveWorkspaceTab(String(value || "agent")),
});

const visibleTabs = computed(() =>
  workspaceTabs.value.filter((tab) => {
    if (tab.kind === "agent") {
      return true;
    }
    return Boolean(tab.sessionId && sessionMatchesSelection(terminalSessions.value[tab.sessionId]));
  }),
);

const terminalPanels = computed(() =>
  visibleTabs.value.flatMap((tab) => {
    if (tab.kind !== "terminal" || !tab.sessionId) {
      return [];
    }
    const session = terminalSessions.value[tab.sessionId];
    if (!session) {
      return [];
    }
    return [{ ...tab, session }] satisfies Array<typeof tab & { session: TerminalSessionState }>;
  }),
);

watchEffect(() => {
  if (!visibleTabs.value.some((tab) => tab.id === activeWorkspaceTabId.value)) {
    store.activateAgentTab();
  }
});

function sessionMatchesSelection(session: TerminalSessionState | undefined) {
  if (!session || session.hostId !== props.selectedHostId) {
    return false;
  }
  if (session.scope === "thread") {
    return session.threadId === props.selectedThreadId;
  }
  if (session.scope === "project") {
    return !props.selectedThreadId && session.projectId === props.selectedProjectId;
  }
  return !props.selectedThreadId && !props.selectedProjectId;
}
</script>

<template>
  <Tabs v-model="activeTab" class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <WorkspaceHeader
      :tabs="visibleTabs"
      :thread-title="threadTitle"
      :can-open-terminal="canOpenTerminal"
      @open-terminal="emit('openTerminal')"
      @close-terminal="store.closeTerminal"
    >
      <template #mobile-start>
        <slot name="mobile-header-start" />
      </template>
    </WorkspaceHeader>

    <TabsContent value="agent" class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <AgentWorkspacePane
        :initializing="initializing"
        :opening-thread="openingThread"
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
        :selected-thread-view-ready="selectedThreadViewReady"
        @load-older="emit('loadOlder')"
      />
    </TabsContent>

    <TabsContent
      v-for="tab in terminalPanels"
      :key="tab.id"
      :value="tab.id"
      class="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <TerminalPanel :session="tab.session" :active="activeWorkspaceTabId === tab.id" />
    </TabsContent>
  </Tabs>
</template>
