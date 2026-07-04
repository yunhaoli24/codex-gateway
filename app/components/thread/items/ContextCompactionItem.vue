<script setup lang="ts">
import { useTimestamp } from "@vueuse/core";
import { ArchiveIcon, CheckCircle2Icon, Loader2Icon } from "@lucide/vue";
import { computed, ref, watch } from "vue";
import { isItemInProgress } from "@/utils/thread-items";
import { formatDurationMs, itemCompletedAtMs, itemStartedAtMs } from "@/utils/item-timing";

const props = defineProps<{ item: Record<string, any> }>();

const { t } = useI18n();
const { timestamp: now, pause, resume } = useTimestamp({ controls: true, interval: 100 });
const localStartedAt = ref(Date.now());

const inProgress = computed(() => isItemInProgress(props.item));
const startedAt = computed(() => itemStartedAtMs(props.item) ?? localStartedAt.value);
const completedAt = computed(() => itemCompletedAtMs(props.item));
const elapsedMs = computed(
  () => (inProgress.value ? now.value : (completedAt.value ?? now.value)) - startedAt.value,
);
const hasReliableCompletedTiming = computed(() =>
  Boolean(itemStartedAtMs(props.item) && itemCompletedAtMs(props.item)),
);
const timeLabel = computed(() => {
  if (!inProgress.value && !hasReliableCompletedTiming.value) {
    return t("app.completed");
  }
  return formatDurationMs(elapsedMs.value);
});

watch(inProgress, (active) => (active ? resume() : pause()), { immediate: true });
</script>

<template>
  <div
    class="max-w-4xl rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-ink-secondary"
  >
    <div class="flex items-center gap-2 text-[0.9375rem]">
      <Loader2Icon v-if="inProgress" class="size-4 shrink-0 animate-spin text-primary" />
      <CheckCircle2Icon v-else class="size-4 shrink-0 text-accent-green" />
      <span class="min-w-0 flex-1 truncate">{{ t("app.contextCompaction") }}</span>
      <span class="rounded-full bg-surface/80 px-2 py-0.5 font-mono text-xs text-ink-secondary">{{
        timeLabel
      }}</span>
      <ArchiveIcon class="size-4 shrink-0 text-ink-muted" />
    </div>
  </div>
</template>
