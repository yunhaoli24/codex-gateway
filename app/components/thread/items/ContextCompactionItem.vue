<script setup lang="ts">
import { ArchiveIcon, CheckCircle2Icon, Loader2Icon } from "@lucide/vue";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { isItemInProgress } from "@/utils/thread-items";
import { formatDurationMs, itemCompletedAtMs, itemStartedAtMs } from "@/utils/item-timing";

const props = defineProps<{ item: Record<string, any> }>();

const { t } = useI18n();
const now = ref(Date.now());
const localStartedAt = ref(now.value);
let timer: ReturnType<typeof setInterval> | null = null;

const inProgress = computed(() => isItemInProgress(props.item));
const startedAt = computed(() => itemStartedAtMs(props.item) ?? localStartedAt.value);
const completedAt = computed(() => itemCompletedAtMs(props.item));
const elapsedMs = computed(
  () => (inProgress.value ? now.value : (completedAt.value ?? now.value)) - startedAt.value,
);
const timeLabel = computed(() => formatDurationMs(elapsedMs.value));

onMounted(() => {
  timer = setInterval(() => {
    if (inProgress.value) {
      now.value = Date.now();
    }
  }, 100);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="max-w-4xl rounded-lg border border-sky-200/70 bg-sky-50/80 px-3 py-2 text-[#4f6672]">
    <div class="flex items-center gap-2 text-[0.9375rem]">
      <Loader2Icon v-if="inProgress" class="size-4 shrink-0 animate-spin text-sky-600" />
      <CheckCircle2Icon v-else class="size-4 shrink-0 text-emerald-600" />
      <span class="min-w-0 flex-1 truncate">{{ t("app.contextCompaction") }}</span>
      <span class="rounded-full bg-white/80 px-2 py-0.5 font-mono text-xs text-[#5f6970]">{{
        timeLabel
      }}</span>
      <ArchiveIcon class="size-4 shrink-0 text-[#8d9499]" />
    </div>
  </div>
</template>
