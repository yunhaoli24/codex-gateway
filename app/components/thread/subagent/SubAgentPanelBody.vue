<script setup lang="ts">
import { Loader2Icon } from "@lucide/vue";
import type { SubAgentPanelState, ThreadViewState } from "@/stores/gateway/types";
import ThreadVirtualTimeline from "@/components/thread/ThreadVirtualTimeline.vue";

defineProps<{
  panel: SubAgentPanelState;
  preview: ThreadViewState | null;
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

    <ThreadVirtualTimeline
      v-else-if="turns.length"
      :thread-id="panel.threadId"
      :follow-key="followKey"
      :turns="turns"
      :host-id="panel.hostId"
      :loading="Boolean(preview?.loading)"
      :loading-older="false"
      :older-turns-cursor="null"
      :visible-error="preview?.error ?? null"
    />

    <div
      v-else
      class="flex flex-1 items-center justify-center px-4 text-center text-sm text-ink-muted"
    >
      {{ t("app.noSubAgentTurns") }}
    </div>
  </div>
</template>
