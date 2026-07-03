import { storeToRefs } from "pinia";
import { computed } from "vue";
import type { useGatewayStore } from "@/stores/gateway";
import { titleForThread } from "@/stores/gateway/thread-utils/identity";

export function useChatWorkspaceState(store: ReturnType<typeof useGatewayStore>) {
  const refs = storeToRefs(store);
  const selectedThreadViewReady = computed(() =>
    isSelectedThreadViewReady({
      selectedThreadId: refs.selectedThreadId.value,
      currentThread: refs.currentThread.value,
      history: refs.history.value,
    }),
  );
  const threadTitle = computed(() => {
    if (!refs.selectedThreadId.value && refs.selectedProject.value) {
      return refs.selectedProject.value.name;
    }
    const thread = selectedThreadViewReady.value ? (refs.currentThread.value as any) : null;
    return titleForThread(thread || { id: refs.selectedThreadId.value }) || "codex-gateway";
  });
  const historyTurns = computed(() => turnsFromHistory(refs.history.value));
  const threadItems = computed(() => historyTurns.value.flatMap((turn: any) => turn.items || []));
  const openingThread = computed(
    () =>
      Boolean(refs.selectedThreadId.value) && refs.loading.value && historyTurns.value.length === 0,
  );
  const outputSignature = computed(() =>
    threadItems.value
      .filter((item: any) => item?.type === "commandExecution" || item?.type === "fileChange")
      .map(
        (item: any) =>
          `${item.id || ""}:${item.aggregatedOutput?.length || 0}:${fileChangeDiffSignature(item)}:${item.status || ""}`,
      )
      .join("|"),
  );
  const visibleError = computed(() =>
    scopedVisibleError({
      error: refs.error.value,
      selectedHostId: refs.selectedHostId.value,
      selectedProjectId: refs.selectedProjectId.value,
      selectedThreadId: refs.selectedThreadId.value,
    }),
  );
  const followKey = computed(() => [
    refs.scrollToLatestToken.value,
    threadItems.value.length,
    refs.events.value.length,
    outputSignature.value,
  ]);

  return {
    ...refs,
    threadTitle,
    historyTurns,
    threadItems,
    openingThread,
    selectedThreadViewReady,
    visibleError,
    followKey,
    canOpenTerminal: computed(() => Boolean(refs.selectedHostId.value)),
  };
}

export function openWorkspaceTerminal(store: ReturnType<typeof useGatewayStore>) {
  const refs = storeToRefs(store);
  if (!refs.selectedHostId.value || !refs.selectedHost.value) {
    return;
  }
  if (refs.selectedThreadId.value) {
    const thread = (refs.currentThread.value as any) || {};
    void store.openTerminal({
      scope: "thread",
      hostId: refs.selectedHostId.value,
      projectId: refs.selectedProjectId.value,
      threadId: refs.selectedThreadId.value,
      cwd: thread.cwd ?? refs.selectedProject.value?.remotePath ?? null,
      title: titleForThread({ id: refs.selectedThreadId.value, ...thread }),
    });
    return;
  }
  if (refs.selectedProject.value) {
    void store.openTerminal({
      scope: "project",
      hostId: refs.selectedProject.value.hostId,
      projectId: refs.selectedProject.value.id,
      cwd: refs.selectedProject.value.remotePath,
      title: refs.selectedProject.value.name,
    });
    return;
  }
  void store.openTerminal({
    scope: "host",
    hostId: refs.selectedHostId.value,
    title: refs.selectedHost.value.name,
  });
}

function turnsFromHistory(history: unknown) {
  const value = history as any;
  return value?.thread?.turns || value?.turns || [];
}

function isSelectedThreadViewReady(input: {
  selectedThreadId: string | null;
  currentThread: unknown;
  history: unknown;
}) {
  if (!input.selectedThreadId) {
    return true;
  }
  const selectedThreadId = String(input.selectedThreadId);
  const currentThreadId = threadIdFromUnknown(input.currentThread);
  if (currentThreadId === selectedThreadId) {
    return true;
  }
  const historyValue = input.history as any;
  const historyThreadId =
    threadIdFromUnknown(historyValue?.thread) ?? threadIdFromUnknown(historyValue);
  return historyThreadId === selectedThreadId;
}

function threadIdFromUnknown(value: unknown) {
  const id = (value as any)?.id;
  return id == null ? null : String(id);
}

function scopedVisibleError(input: {
  error: {
    message: string;
    hostId: number | null;
    projectId: number | null;
    threadId: string | null;
  } | null;
  selectedHostId: number | null;
  selectedProjectId: number | null;
  selectedThreadId: string | null;
}) {
  const current = input.error;
  if (!current) {
    return null;
  }
  if (current.hostId !== null && current.hostId !== input.selectedHostId) {
    return null;
  }
  if (current.projectId !== null && current.projectId !== input.selectedProjectId) {
    return null;
  }
  if (current.threadId !== null && current.threadId !== input.selectedThreadId) {
    return null;
  }
  return current.message;
}

function fileChangeDiffSignature(item: any) {
  if (item?.type !== "fileChange" || !Array.isArray(item.changes)) {
    return "";
  }
  return item.changes
    .map((change: any) => `${change?.path || change?.filePath || ""}:${change?.diff?.length || 0}`)
    .join(",");
}
