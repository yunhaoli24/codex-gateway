<script setup lang="ts">
import { toRefs } from "vue";
import type { ThreadRuntimeStatus } from "~~/shared/types";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import TerminalPanel from "@/components/terminal/TerminalPanel.vue";
import type { SubAgentPanelState } from "@/stores/gateway/types";
import AgentWorkspacePane from "./AgentWorkspacePane.vue";
import DesktopWorkspaceHeader from "./DesktopWorkspaceHeader.vue";
import MobileWorkspaceHeader from "./MobileWorkspaceHeader.vue";
import WorkspaceFilePreviewPanel from "./WorkspaceFilePreviewPanel.vue";
import WorkspaceSubAgentPanel from "./WorkspaceSubAgentPanel.vue";
import { useWorkspaceTabs } from "./useWorkspaceTabs";

const props = defineProps<{
  layout: "desktop" | "mobile";
  threadTitle: string;
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

const emit = defineEmits<{
  loadOlder: [];
  openTerminal: [];
}>();

const { selectedHostId, selectedProjectId, selectedThreadId, visibleSubAgentPanels } =
  toRefs(props);
const {
  activeTab,
  activeWorkspaceTabId,
  visibleTabs,
  terminalPanels,
  subAgentPanels,
  filePanels,
  closeWorkspaceTab,
  interruptSubAgent,
} = useWorkspaceTabs({
  selectedHostId,
  selectedProjectId,
  selectedThreadId,
  visibleSubAgentPanels,
});
</script>

<template>
  <Tabs v-model="activeTab" class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <DesktopWorkspaceHeader
      v-if="layout === 'desktop'"
      :tabs="visibleTabs"
      :thread-title="threadTitle"
      :can-open-terminal="canOpenTerminal"
      @open-terminal="emit('openTerminal')"
      @close-tab="closeWorkspaceTab"
    />
    <MobileWorkspaceHeader
      v-else
      :tabs="visibleTabs"
      :can-open-terminal="canOpenTerminal"
      @open-terminal="emit('openTerminal')"
      @close-tab="closeWorkspaceTab"
    >
      <template #start>
        <slot name="mobile-header-start" />
      </template>
    </MobileWorkspaceHeader>

    <TabsContent value="agent" class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <AgentWorkspacePane
        :initializing="initializing"
        :opening-thread="openingThread"
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

    <TabsContent
      v-for="tab in subAgentPanels"
      :key="tab.id"
      :value="tab.id"
      class="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <WorkspaceSubAgentPanel
        :title="tab.title"
        :panel="tab.panel"
        :preview="tab.preview"
        :turns="tab.turns"
        :follow-key="tab.followKey"
        :status="tab.status"
        @interrupt="interruptSubAgent"
      />
    </TabsContent>

    <TabsContent
      v-for="tab in filePanels"
      :key="tab.id"
      :value="tab.id"
      class="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <WorkspaceFilePreviewPanel :file="tab.file" />
    </TabsContent>
  </Tabs>
</template>
