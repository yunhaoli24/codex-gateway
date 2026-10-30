<script setup lang="ts">
import { FolderIcon, InfoIcon, Loader2Icon, RefreshCwIcon } from "@lucide/vue";
import { computed, ref } from "vue";
import { Button } from "@codex-gateway/ui/button";
import ChatComposer from "@/components/chat/ChatComposer.vue";
import ChatPanelScrollArea from "@/components/chat/ChatPanelScrollArea.vue";
import ProjectThreadList from "@/components/chat/ProjectThreadList.vue";
import ThreadVirtualTimeline from "@/components/thread/ThreadVirtualTimeline.vue";
import ActiveSubAgentsBar from "@/components/thread/subagent/ActiveSubAgentsBar.vue";
import MisalignmentRecoveryCard from "@/components/thread/MisalignmentRecoveryCard.vue";
import McpRuntimeStatusBar from "@/components/thread/McpRuntimeStatusBar.vue";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { useGatewayThreadTurnsStore } from "@/stores/gateway-thread-turns";
import { useChatWorkspaceState } from "./chat-workspace-state";

const {
  initializing,
  openingThread,
  selectedThreadId,
  selectedThreadStatus,
  selectedThreadReadOnly,
  selectedCwd,
  selectedHostId,
  currentThread,
  historyTurns,
  loading,
  loadingOlderTurns,
  oldestTimelineCursor,
  scrollToLatestToken,
  visibleError,
  selectedThreadViewReady,
} = useChatWorkspaceState();
const threadTurns = useGatewayThreadTurnsStore();
const views = useGatewayThreadViewStore();
const retryingWriter = ref(false);

const { t } = useI18n();
const showThreadLoading = computed(
  () =>
    initializing.value ||
    openingThread.value ||
    (Boolean(selectedThreadId.value) && !selectedThreadViewReady.value && !visibleError.value),
);

async function retryWriter() {
  retryingWriter.value = true;
  try {
    await views.retryThreadWriter();
  } finally {
    retryingWriter.value = false;
  }
}
</script>

<template>
  <div class="relative flex min-h-0 flex-1 overflow-hidden">
    <div data-testid="chat-main-pane" class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <ActiveSubAgentsBar
        v-if="selectedThreadId"
        :turns="historyTurns"
        :host-id="selectedHostId"
        :parent-thread-id="selectedThreadId"
      />
      <McpRuntimeStatusBar
        v-if="selectedThreadId && selectedThreadViewReady && !selectedThreadReadOnly"
        :host-id="selectedHostId"
        :thread-id="selectedThreadId"
      />
      <ChatPanelScrollArea
        v-if="showThreadLoading"
        class="flex items-center justify-center text-[0.9375rem] text-ink-muted"
      >
        <div class="flex items-center gap-2">
          <Loader2Icon class="size-4 animate-spin" />
          <span>{{ t("app.loadingGateway") }}</span>
        </div>
      </ChatPanelScrollArea>

      <div
        v-if="selectedThreadId && selectedThreadReadOnly"
        class="mx-auto flex w-full max-w-4xl items-start gap-3 border-b border-hairline bg-surface-muted px-4 py-3 text-sm text-ink-muted"
        data-testid="thread-read-only-notice"
      >
        <InfoIcon class="mt-0.5 size-4 shrink-0" />
        <div class="min-w-0 flex-1">
          <p class="font-medium text-ink">{{ t("app.threadOwnedByOtherClient") }}</p>
          <p>{{ t("app.closeOtherClientAndRetry") }}</p>
        </div>
        <Button
          type="button"
          data-testid="retry-thread-writer"
          :disabled="retryingWriter"
          variant="outline"
          size="sm"
          @click="retryWriter"
        >
          <RefreshCwIcon :class="['size-4', retryingWriter && 'animate-spin']" />
          {{ t("app.retryTakeover") }}
        </Button>
      </div>

      <ThreadVirtualTimeline
        v-if="selectedThreadId && !showThreadLoading"
        :thread-id="selectedThreadId"
        :thread-status="selectedThreadStatus"
        :turns="historyTurns"
        :host-id="selectedHostId"
        :workspace-root="currentThread?.cwd ?? null"
        :loading="loading"
        :loading-older="loadingOlderTurns"
        :oldest-timeline-cursor="oldestTimelineCursor"
        :scroll-to-latest-token="scrollToLatestToken"
        @load-older="threadTurns.loadOlderTurns"
      />

      <ChatPanelScrollArea v-else-if="!showThreadLoading && selectedCwd">
        <ProjectThreadList />
      </ChatPanelScrollArea>

      <ChatPanelScrollArea v-else-if="!showThreadLoading" class="flex items-start">
        <div
          class="max-w-3xl rounded-2xl bg-canvas-soft px-4 py-3 text-[0.9375rem] leading-7 text-ink md:ml-auto md:px-5 md:py-4"
        >
          <div class="mb-2 flex items-center gap-2 text-ink-muted">
            <FolderIcon class="size-4" />
            {{ selectedCwd ? t("app.selectThreadFirst") : t("app.selectProjectFirst") }}
          </div>
          {{ selectedCwd ? t("app.noThread") : t("app.chooseProject") }}
        </div>
      </ChatPanelScrollArea>

      <MisalignmentRecoveryCard v-if="selectedThreadId && !selectedThreadReadOnly" />
      <ChatComposer v-if="!selectedThreadReadOnly && (selectedThreadId || selectedCwd)" />
    </div>
  </div>
</template>
