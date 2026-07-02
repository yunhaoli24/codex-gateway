<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useGatewayStore } from "@/stores/gateway";
import { titleForThread } from "@/stores/gateway/thread-utils/identity";
import WorkspaceTabs from "./WorkspaceTabs.vue";

const store = useGatewayStore();
const {
  selectedHostId,
  selectedProjectId,
  selectedThreadId,
  selectedHost,
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
const canOpenTerminal = computed(() => Boolean(selectedHostId.value));

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

function openCurrentTerminal() {
  if (!selectedHostId.value || !selectedHost.value) {
    return;
  }
  if (selectedThreadId.value) {
    const thread = (currentThread.value as any) || {};
    void store.openTerminal({
      scope: "thread",
      hostId: selectedHostId.value,
      projectId: selectedProjectId.value,
      threadId: selectedThreadId.value,
      cwd: thread.cwd ?? selectedProject.value?.remotePath ?? null,
      title: titleForThread({ id: selectedThreadId.value, ...thread }),
    });
    return;
  }
  if (selectedProject.value) {
    void store.openTerminal({
      scope: "project",
      hostId: selectedProject.value.hostId,
      projectId: selectedProject.value.id,
      cwd: selectedProject.value.remotePath,
      title: selectedProject.value.name,
    });
    return;
  }
  void store.openTerminal({
    scope: "host",
    hostId: selectedHostId.value,
    title: selectedHost.value.name,
  });
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
      :follow-key="[scrollToLatestToken, threadItems.length, events.length, outputSignature]"
      :visible-sub-agent-panels="visibleSubAgentPanels"
      :can-open-terminal="canOpenTerminal"
      @load-older="loadOlderTurns"
      @open-terminal="openCurrentTerminal"
    />
  </section>
</template>
