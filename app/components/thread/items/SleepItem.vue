<script setup lang="ts">
import type { ThreadHistoryItem } from "~~/shared/types";
import { Loader2Icon, TimerIcon } from "@lucide/vue";
import { useTimestamp } from "@vueuse/core";
import { computed, watch } from "vue";
import { Checkpoint, CheckpointIcon } from "@codex-gateway/ai-elements/checkpoint";
import { isItemInProgress } from "@/utils/thread-items";
import { itemStartedAtMs } from "@/utils/item-timing";

const props = defineProps<{ item: ThreadHistoryItem }>();

const { t } = useI18n();
const inProgress = computed(() => isItemInProgress(props.item));
const { timestamp: now, pause, resume } = useTimestamp({ controls: true, interval: 1000 });
const countdown = computed(() => {
  const duration = props.item.durationMs;
  const startedAt = itemStartedAtMs(props.item);
  // Use server timing, not mount time: virtualized rows can remount during the same wait.
  if (typeof duration !== "number" || !Number.isFinite(duration) || startedAt === null) {
    return null;
  }
  const seconds = Math.ceil(Math.max(0, duration - (now.value - startedAt)) / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
});
watch(inProgress, (active) => (active ? resume() : pause()), { immediate: true });
</script>

<template>
  <!-- Checkpoint appends a full-width Separator. Let only that separator shrink; otherwise
       it squeezes the Chinese label onto two lines. Order the timer after it, without a badge
       or progress bar: this is routine waiting, not a warning or measured task progress. -->
  <Checkpoint
    class="max-w-4xl gap-2 py-1 text-[0.9375rem] text-ink-muted [&>[data-slot=separator]]:min-w-0 [&>[data-slot=separator]]:flex-1"
  >
    <CheckpointIcon>
      <Loader2Icon v-if="inProgress" class="size-4 shrink-0 animate-spin" />
      <TimerIcon v-else class="size-4 shrink-0" />
    </CheckpointIcon>
    <span class="shrink-0 whitespace-nowrap">{{ t("app.sleep") }}</span>
    <span
      v-if="inProgress && countdown !== null"
      class="order-last shrink-0 whitespace-nowrap text-xs tabular-nums text-ink-muted"
      >{{ countdown }}</span
    >
  </Checkpoint>
</template>
