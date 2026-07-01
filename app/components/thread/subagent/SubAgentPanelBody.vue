<script setup lang="ts">
import { Loader2Icon } from "@lucide/vue";
import type { SubAgentPanelState, ThreadPreviewState } from "@/stores/gateway/types";
import ThreadTurnView from "@/components/thread/ThreadTurnView.vue";
import TanStackStickToBottomScrollArea from "@/components/common/TanStackStickToBottomScrollArea.vue";

defineProps<{
  panel: SubAgentPanelState;
  preview: ThreadPreviewState | null;
  turns: any[];
  followKey: string;
}>();

const { t } = useI18n();
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div
      v-if="preview?.error"
      class="m-3 whitespace-pre-line rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
    >
      {{ preview.error }}
    </div>

    <div
      v-else-if="preview?.loading && !turns.length"
      class="flex flex-1 items-center justify-center text-sm text-ink-muted"
    >
      <Loader2Icon class="mr-2 size-4 animate-spin" />
      {{ t("app.loadingSubAgent") }}
    </div>

    <TanStackStickToBottomScrollArea
      v-else-if="turns.length"
      class="min-h-0 w-full flex-1 overflow-hidden"
      viewport-class="h-full"
      content-class="space-y-5 px-4 py-5"
      :follow-key="followKey"
      :estimate-size="520"
    >
      <ThreadTurnView
        v-for="turn in turns"
        :key="turn.id || JSON.stringify(turn).length"
        :turn="turn"
        :host-id="panel.hostId"
        :thread-id="panel.threadId"
      />
    </TanStackStickToBottomScrollArea>

    <div
      v-else
      class="flex flex-1 items-center justify-center px-4 text-center text-sm text-ink-muted"
    >
      {{ t("app.noSubAgentTurns") }}
    </div>
  </div>
</template>
