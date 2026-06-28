<script setup lang="ts">
import { CheckCircle2Icon, Loader2Icon, TimerIcon } from "@lucide/vue";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { isItemInProgress } from "@/utils/thread-items";
import { formatDurationMs, itemCompletedAtMs, itemStartedAtMs } from "@/utils/item-timing";

const props = defineProps<{ item: Record<string, any> }>();

const { t } = useI18n();
const now = ref(Date.now());
const localStartedAt = ref(now.value);
let timer: ReturnType<typeof setInterval> | null = null;

const inProgress = computed(() => isItemInProgress(props.item));
const durationMs = computed(() => Number(props.item.durationMs || props.item.duration_ms || 0));
const startedAt = computed(() => itemStartedAtMs(props.item) ?? localStartedAt.value);
const completedAt = computed(() => itemCompletedAtMs(props.item));
const elapsedMs = computed(() =>
  Math.max(0, (inProgress.value ? now.value : (completedAt.value ?? now.value)) - startedAt.value),
);
const progressPercent = computed(() => {
  if (!durationMs.value) return inProgress.value ? 18 : 100;
  return Math.max(0, Math.min(100, (elapsedMs.value / durationMs.value) * 100));
});
const timeLabel = computed(() => {
  if (!durationMs.value) return formatDurationMs(elapsedMs.value);
  return `${formatDurationMs(elapsedMs.value)} / ${formatDurationMs(durationMs.value)}`;
});

onMounted(() => {
  timer = setInterval(() => {
    if (inProgress.value) {
      now.value = Date.now();
    }
  }, 250);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div
    class="max-w-4xl overflow-hidden rounded-lg border border-amber-200/80 bg-amber-50/80 text-[#695b3f]"
  >
    <div class="relative">
      <div
        class="absolute inset-y-0 left-0 bg-amber-200/60 transition-[width] duration-300"
        :style="{ width: `${progressPercent}%` }"
      />
      <div class="relative flex items-center gap-2 px-3 py-2 text-[0.9375rem]">
        <Loader2Icon v-if="inProgress" class="size-4 shrink-0 animate-spin text-amber-600" />
        <CheckCircle2Icon v-else class="size-4 shrink-0 text-emerald-600" />
        <span class="min-w-0 flex-1 truncate">{{ t("app.sleep") }}</span>
        <span class="rounded-full bg-white/80 px-2 py-0.5 font-mono text-xs text-[#5f6970]">{{
          timeLabel
        }}</span>
        <TimerIcon class="size-4 shrink-0 text-[#8d9499]" />
      </div>
    </div>
  </div>
</template>
