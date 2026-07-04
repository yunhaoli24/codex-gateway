<script setup lang="ts">
import { useTimestamp } from "@vueuse/core";
import { BrainIcon, Loader2Icon } from "@lucide/vue";
import { computed, ref, watch } from "vue";
import MarkdownContent from "@/components/common/MarkdownContent.vue";
import { isItemInProgress, threadItemText } from "@/utils/thread-items";
import { formatDurationMs, itemCompletedAtMs, itemStartedAtMs } from "@/utils/item-timing";

const props = defineProps<{ item: Record<string, any> }>();
const { t } = useI18n();
const { timestamp: now, pause, resume } = useTimestamp({ controls: true, interval: 100 });
const localStartedAt = ref(Date.now());

const text = computed(() => threadItemText(props.item));
const inProgress = computed(() => isItemInProgress(props.item));
const startedAt = computed(() => itemStartedAtMs(props.item) ?? localStartedAt.value);
const completedAt = computed(() => itemCompletedAtMs(props.item));
const elapsedMs = computed(
  () => (inProgress.value ? now.value : (completedAt.value ?? now.value)) - startedAt.value,
);
const timeLabel = computed(() => formatDurationMs(elapsedMs.value));

watch(inProgress, (active) => (active ? resume() : pause()), { immediate: true });
</script>

<template>
  <div class="max-w-4xl text-[0.9375rem] leading-7 text-ink-muted">
    <div class="flex items-start gap-2">
      <Loader2Icon v-if="inProgress" class="mt-1 size-4 shrink-0 animate-spin text-primary" />
      <BrainIcon v-else class="mt-1 size-4 shrink-0" />
      <div class="min-w-0 flex-1">
        <div class="mb-1 flex items-center gap-2 text-xs text-ink-muted">
          <span>{{ t("app.thinking") }}</span>
          <span
            class="rounded-full bg-surface/80 px-2 py-0.5 font-mono text-[0.6875rem] text-ink-secondary"
            >{{ timeLabel }}</span
          >
        </div>
        <MarkdownContent v-if="text" :content="text" compact />
      </div>
    </div>
  </div>
</template>
