<script setup lang="ts">
import { FolderIcon, Loader2Icon } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { Badge } from "@/components/ui/badge";
import ChatComposer from "@/components/chat/ChatComposer.vue";
import ChatPanelScrollArea from "@/components/chat/ChatPanelScrollArea.vue";
import ProjectThreadList from "@/components/chat/ProjectThreadList.vue";
import LanguageSwitcher from "@/components/common/LanguageSwitcher.vue";
import SubAgentThreadPanel from "@/components/thread/SubAgentThreadPanel.vue";
import ThreadVirtualTimeline from "@/components/thread/ThreadVirtualTimeline.vue";
import { useGatewayStore } from "@/stores/gateway";
import { titleForThread } from "@/stores/gateway/thread-utils/identity";

const store = useGatewayStore();
const { t } = useI18n();
const {
  selectedHostId,
  selectedProjectId,
  selectedThreadId,
  selectedProject,
  currentThread,
  history,
  events,
  status,
  initializing,
  loading,
  loadingOlderTurns,
  olderTurnsCursor,
  error,
  scrollToLatestToken,
  visibleSubAgentPanels,
} = storeToRefs(store);

const threadTitle = computed(() => {
  if (!selectedThreadId.value && selectedProject.value) {
    return selectedProject.value.name;
  }
  const thread = currentThread.value as any;
  return titleForThread(thread || { id: selectedThreadId.value }) || "codex-gateway";
});

const historyTurns = computed(() => {
  const value = history.value as any;
  return value?.thread?.turns || value?.turns || [];
});

const threadItems = computed(() => {
  return historyTurns.value.flatMap((turn: any) => turn.items || []);
});
const hasThreadContent = computed(() => selectedThreadId.value && historyTurns.value.length > 0);
const openingThread = computed(
  () => selectedThreadId.value && loading.value && !hasThreadContent.value,
);
const outputSignature = computed(() => {
  return threadItems.value
    .filter((item: any) => item?.type === "commandExecution" || item?.type === "fileChange")
    .map(
      (item: any) =>
        `${item.id || ""}:${item.aggregatedOutput?.length || 0}:${fileChangeDiffSignature(item)}:${item.status || ""}`,
    )
    .join("|");
});
const visibleError = computed(() => {
  const current = error.value;
  if (!current) {
    return null;
  }
  if (current.hostId !== null && current.hostId !== selectedHostId.value) {
    return null;
  }
  if (current.projectId !== null && current.projectId !== selectedProjectId.value) {
    return null;
  }
  if (current.threadId !== null && current.threadId !== selectedThreadId.value) {
    return null;
  }
  return current.message;
});

function loadOlderTurns() {
  void store.loadOlderTurns();
}

function fileChangeDiffSignature(item: any) {
  if (item?.type !== "fileChange" || !Array.isArray(item.changes)) {
    return "";
  }
  return item.changes
    .map((change: any) => `${change?.path || change?.filePath || ""}:${change?.diff?.length || 0}`)
    .join(",");
}
</script>

<template>
  <section class="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-surface">
    <header
      class="hidden min-h-16 shrink-0 items-center justify-between border-b border-hairline px-[clamp(1rem,2.5vw,1.5rem)] md:flex"
    >
      <div class="flex min-w-0 items-center gap-3">
        <h1 class="truncate text-[0.9375rem] font-semibold">{{ threadTitle }}</h1>
      </div>
      <div class="flex items-center gap-2 text-ink-muted">
        <LanguageSwitcher />
        <Badge variant="secondary"
          >{{ status?.activeControllers.length || 0 }} {{ t("app.active") }}</Badge
        >
      </div>
    </header>

    <div class="relative flex min-h-0 flex-1 overflow-hidden">
      <div
        data-testid="chat-main-pane"
        class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-[flex-basis,max-width] duration-300 ease-out md:flex-none"
        :class="
          visibleSubAgentPanels.length
            ? 'md:basis-[72%] md:max-w-[72%]'
            : 'md:basis-full md:max-w-full'
        "
      >
        <ChatPanelScrollArea
          v-if="initializing || openingThread"
          class="flex items-center justify-center text-[0.9375rem] text-ink-muted"
        >
          <div class="flex items-center gap-2">
            <Loader2Icon class="size-4 animate-spin" />
            <span>{{ t("app.loadingGateway") }}</span>
          </div>
        </ChatPanelScrollArea>

        <ThreadVirtualTimeline
          v-else-if="selectedThreadId"
          :thread-id="selectedThreadId"
          :turns="historyTurns"
          :host-id="selectedHostId"
          :loading="loading"
          :loading-older="loadingOlderTurns"
          :older-turns-cursor="olderTurnsCursor"
          :visible-error="visibleError"
          :follow-key="[scrollToLatestToken, threadItems.length, events.length, outputSignature]"
          @load-older="loadOlderTurns"
        />

        <ChatPanelScrollArea v-else-if="selectedProjectId">
          <ProjectThreadList />
        </ChatPanelScrollArea>

        <ChatPanelScrollArea v-else class="flex items-start">
          <div
            class="max-w-3xl rounded-2xl bg-canvas-soft px-4 py-3 text-[0.9375rem] leading-7 text-ink md:ml-auto md:px-5 md:py-4"
          >
            <div class="mb-2 flex items-center gap-2 text-ink-muted">
              <FolderIcon class="size-4" />
              {{ selectedProjectId ? t("app.selectThreadFirst") : t("app.selectProjectFirst") }}
            </div>
            {{ selectedProjectId ? t("app.noThread") : t("app.chooseProject") }}
          </div>
        </ChatPanelScrollArea>

        <ChatComposer v-if="selectedThreadId || selectedProjectId" />
      </div>
      <SubAgentThreadPanel />
    </div>
  </section>
</template>
