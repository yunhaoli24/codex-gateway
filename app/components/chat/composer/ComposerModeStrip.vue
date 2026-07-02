<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { ThreadGoal } from "~~/shared/types";
import { Badge } from "@/components/ui/badge";

const props = defineProps<{
  planModeActive: boolean;
  goal: ThreadGoal | null;
  goalObservedAt: number | null;
}>();

const now = ref(Date.now());
let timer: number | null = null;

const activeGoalElapsedSeconds = computed(() => {
  if (!props.goal) {
    return 0;
  }
  const observedDelta =
    props.goal.status === "active" && props.goalObservedAt
      ? Math.max(0, (now.value - props.goalObservedAt) / 1000)
      : 0;
  return props.goal.timeUsedSeconds + observedDelta;
});

const showStrip = computed(() => props.planModeActive || props.goal);

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Date.now();
  }, 250);
});

onBeforeUnmount(() => {
  if (timer) {
    window.clearInterval(timer);
  }
});

function formatElapsed(seconds: number) {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.floor(seconds % 60)}s`;
}
</script>

<template>
  <div v-if="showStrip" class="mb-2 flex min-w-0 flex-wrap items-center gap-2">
    <Badge v-if="planModeActive" variant="outline" class="border-primary/30 text-primary">
      {{ $t("app.planModeActive") }}
    </Badge>
    <Badge
      v-if="goal"
      variant="secondary"
      class="min-w-0 max-w-full gap-1.5 rounded-full border border-hairline bg-canvas-soft"
    >
      <span class="shrink-0">{{ $t("app.goalModeActive") }}</span>
      <span class="min-w-0 truncate text-ink-secondary">{{ goal.objective }}</span>
      <span class="shrink-0 text-ink-muted">{{ formatElapsed(activeGoalElapsedSeconds) }}</span>
    </Badge>
  </div>
</template>
