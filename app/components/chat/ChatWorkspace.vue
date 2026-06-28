<script setup lang="ts">
import { FolderIcon } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { computed, nextTick, ref, watch } from "vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import ChatComposer from "@/components/chat/ChatComposer.vue";
import ProjectThreadList from "@/components/chat/ProjectThreadList.vue";
import LanguageSwitcher from "@/components/common/LanguageSwitcher.vue";
import ThreadTurnView from "@/components/thread/ThreadTurnView.vue";
import { useStickToBottomScroll } from "@/composables/useStickToBottomScroll";
import { useGatewayStore } from "@/stores/gateway";
import { titleForThread } from "@/stores/gateway/thread-utils";

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
} = storeToRefs(store);

const scrollAreaRef = ref<any>(null);
const {
  contentRef,
  followLatest,
  scrollViewport,
  scrollToBottom,
  resetFollowLatest,
  handleScroll,
} = useStickToBottomScroll(scrollAreaRef, {
  onTopReached: () => {
    if (olderTurnsCursor.value && !loadingOlderTurns.value) {
      void loadOlderTurns();
    }
  },
});

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
const outputSignature = computed(() => {
  return threadItems.value
    .filter((item: any) => item?.type === "commandExecution" || item?.type === "fileChange")
    .map(
      (item: any) => `${item.id || ""}:${item.aggregatedOutput?.length || 0}:${item.status || ""}`,
    )
    .join("|");
});

async function loadOlderTurns() {
  const viewport = scrollViewport();
  const previousHeight = viewport?.scrollHeight ?? 0;
  await store.loadOlderTurns();
  await nextTick();
  if (viewport) {
    viewport.scrollTop += viewport.scrollHeight - previousHeight;
  }
}

watch(
  () => [selectedThreadId.value, scrollToLatestToken.value, initializing.value] as const,
  (
    [threadId, scrollToken, isInitializing],
    [previousThreadId, previousScrollToken, wasInitializing] = [null, -1, false],
  ) => {
    if (!threadId || isInitializing) {
      return;
    }
    if (threadId !== previousThreadId || scrollToken !== previousScrollToken || wasInitializing) {
      resetFollowLatest();
    }
  },
  { flush: "post", immediate: true },
);

watch(
  () => [selectedThreadId.value, historyTurns.value.length, initializing.value] as const,
  (
    [threadId, turnsLength, isInitializing],
    [, previousTurnsLength, wasInitializing] = [null, 0, false],
  ) => {
    if (!threadId || isInitializing || !turnsLength) {
      return;
    }
    if (wasInitializing || !previousTurnsLength) {
      resetFollowLatest();
    }
  },
  { flush: "post" },
);

watch(
  () => [threadItems.value.length, events.value.length, outputSignature.value],
  () => {
    if (followLatest.value) {
      void scrollToBottom();
    }
  },
  { flush: "post" },
);
</script>

<template>
  <section class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white">
    <header
      class="hidden min-h-16 shrink-0 items-center justify-between border-b border-black/10 px-[clamp(1rem,2.5vw,1.5rem)] md:flex"
    >
      <div class="flex min-w-0 items-center gap-3">
        <h1 class="truncate text-[0.9375rem] font-semibold">{{ threadTitle }}</h1>
      </div>
      <div class="flex items-center gap-2 text-[#7d858b]">
        <LanguageSwitcher />
        <Badge variant="secondary"
          >{{ status?.activeControllers.length || 0 }} {{ t("app.active") }}</Badge
        >
      </div>
    </header>

    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ScrollArea
        ref="scrollAreaRef"
        data-testid="chat-scroll-area"
        class="h-full min-h-0 flex-1 overflow-hidden"
        @scroll.capture="handleScroll"
      >
        <div
          ref="contentRef"
          class="mx-auto flex min-h-[calc(100dvh-14rem)] w-full max-w-5xl flex-col gap-5 px-[clamp(0.875rem,4vw,2rem)] py-4 md:min-h-[calc(100vh-16rem)] md:gap-8 md:py-[clamp(2rem,6vh,3rem)]"
        >
          <div
            v-if="!initializing && selectedThreadId && olderTurnsCursor"
            class="flex justify-center"
          >
            <Button
              data-testid="load-older-turns-button"
              variant="outline"
              size="sm"
              :disabled="loadingOlderTurns"
              @click="loadOlderTurns"
            >
              {{ loadingOlderTurns ? t("app.loadingOlder") : t("app.loadOlder") }}
            </Button>
          </div>

          <div
            v-if="initializing"
            class="mx-auto flex min-h-60 max-w-3xl items-center justify-center text-[0.9375rem] text-[#7d858b] md:min-h-80"
          >
            {{ t("app.loadingGateway") }}
          </div>

          <div v-else-if="selectedThreadId && historyTurns.length" class="space-y-5 md:space-y-8">
            <ThreadTurnView
              v-for="turn in historyTurns"
              :key="turn.id || `turn-${JSON.stringify(turn).length}`"
              :turn="turn"
              :host-id="selectedHostId"
            />
          </div>
          <ProjectThreadList v-else-if="selectedProjectId && !selectedThreadId" />
          <div
            v-else
            class="max-w-3xl rounded-2xl bg-[#f1f1f1] px-4 py-3 text-[0.9375rem] leading-7 text-[#202225] md:ml-auto md:px-5 md:py-4"
          >
            <div class="mb-2 flex items-center gap-2 text-[#7d858b]">
              <FolderIcon class="size-4" />
              {{ selectedProjectId ? t("app.selectThreadFirst") : t("app.selectProjectFirst") }}
            </div>
            {{ selectedProjectId ? t("app.noThread") : t("app.chooseProject") }}
          </div>

          <div
            v-if="loading && !initializing && selectedThreadId"
            class="max-w-3xl text-[0.9375rem] text-[#a5a9ad]"
          >
            {{ t("app.thinking") }}
          </div>

          <div
            v-if="error"
            class="mx-auto max-w-3xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {{ error }}
          </div>
        </div>
      </ScrollArea>

      <ChatComposer v-if="selectedThreadId" />
    </div>
  </section>
</template>
