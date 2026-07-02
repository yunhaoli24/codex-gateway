<script setup lang="ts">
import { MonitorIcon, TerminalIcon, XIcon } from "@lucide/vue";
import { storeToRefs } from "pinia";
import type { TerminalSessionSnapshot } from "~~/shared/types";
import { computed, watchEffect } from "vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LanguageSwitcher from "@/components/common/LanguageSwitcher.vue";
import TerminalPanel from "@/components/terminal/TerminalPanel.vue";
import { useGatewayStore } from "@/stores/gateway";
import AgentWorkspacePane from "./AgentWorkspacePane.vue";

const props = defineProps<{
  threadTitle: string;
  activeControllerCount: number;
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
    return [{ ...tab, session }] satisfies Array<typeof tab & { session: TerminalSessionSnapshot }>;
  }),
);

watchEffect(() => {
  if (!visibleTabs.value.some((tab) => tab.id === activeWorkspaceTabId.value)) {
    store.activateAgentTab();
  }
});

function sessionMatchesSelection(session: TerminalSessionSnapshot | undefined) {
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
    <header
      class="hidden min-h-16 shrink-0 items-center gap-4 border-b border-hairline px-[clamp(1rem,2.5vw,1.5rem)] md:flex"
    >
      <div class="flex min-w-0 items-center gap-3">
        <h1 class="truncate text-[0.9375rem] font-semibold">{{ threadTitle }}</h1>
        <Button
          data-testid="open-terminal-button"
          variant="ghost"
          size="sm"
          class="h-8 shrink-0 rounded-md px-2 text-ink-muted hover:bg-canvas-soft hover:text-ink"
          :disabled="!canOpenTerminal"
          :aria-label="$t('app.openTerminal')"
          @click="emit('openTerminal')"
        >
          <TerminalIcon class="size-4" />
          <span class="hidden lg:inline">{{ $t("app.openTerminal") }}</span>
        </Button>
      </div>
      <TabsList variant="line" class="min-w-0 flex-1 justify-center overflow-x-auto">
        <TabsTrigger
          v-for="tab in visibleTabs"
          :key="tab.id"
          :value="tab.id"
          class="group min-w-0 flex-none gap-1.5 rounded-lg px-2.5 data-active:bg-canvas-soft data-active:text-ink data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:bg-canvas-soft group-data-[variant=line]/tabs-list:data-active:after:opacity-0"
        >
          <MonitorIcon v-if="tab.kind === 'agent'" class="size-3.5" />
          <TerminalIcon v-else class="size-3.5" />
          <span class="max-w-[min(14rem,35vw)] truncate">{{ tab.title }}</span>
          <button
            v-if="tab.kind === 'terminal' && tab.sessionId"
            type="button"
            class="ml-1 inline-flex size-4 items-center justify-center rounded-sm text-ink-muted opacity-70 hover:bg-surface hover:text-ink group-data-active:opacity-100"
            :aria-label="$t('app.closeTerminal')"
            @click.stop="store.closeTerminal(tab.sessionId)"
          >
            <XIcon class="size-3" />
          </button>
        </TabsTrigger>
      </TabsList>
      <div class="flex items-center gap-2 text-ink-muted">
        <LanguageSwitcher />
        <Badge variant="secondary">{{ activeControllerCount }} {{ $t("app.active") }}</Badge>
      </div>
    </header>

    <div class="flex min-h-11 shrink-0 items-center border-b border-hairline px-3 md:hidden">
      <TabsList variant="line" class="min-w-0 max-w-full flex-1 overflow-x-auto">
        <TabsTrigger
          v-for="tab in visibleTabs"
          :key="tab.id"
          :value="tab.id"
          class="group min-w-0 flex-none gap-1.5 rounded-lg px-2 data-active:bg-canvas-soft data-active:text-ink group-data-[variant=line]/tabs-list:data-active:bg-canvas-soft group-data-[variant=line]/tabs-list:data-active:after:opacity-0"
        >
          <MonitorIcon v-if="tab.kind === 'agent'" class="size-3.5" />
          <TerminalIcon v-else class="size-3.5" />
          <span class="max-w-[min(12rem,46vw)] truncate">{{ tab.title }}</span>
          <button
            v-if="tab.kind === 'terminal' && tab.sessionId"
            type="button"
            class="ml-1 inline-flex size-4 items-center justify-center rounded-sm text-ink-muted opacity-70 hover:bg-surface hover:text-ink group-data-active:opacity-100"
            :aria-label="$t('app.closeTerminal')"
            @click.stop="store.closeTerminal(tab.sessionId)"
          >
            <XIcon class="size-3" />
          </button>
        </TabsTrigger>
      </TabsList>
      <Button
        data-testid="open-terminal-mobile-button"
        variant="ghost"
        size="sm"
        class="ml-2 h-8 shrink-0 rounded-md px-2 text-ink-muted hover:bg-canvas-soft hover:text-ink"
        :disabled="!canOpenTerminal"
        :aria-label="$t('app.openTerminal')"
        @click="emit('openTerminal')"
      >
        <TerminalIcon class="size-4" />
      </Button>
    </div>

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
