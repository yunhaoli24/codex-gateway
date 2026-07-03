<script setup lang="ts">
import { XIcon } from "@lucide/vue";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { ThreadGoal } from "~~/shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const props = defineProps<{
  planModeActive: boolean;
  planSummary: string;
  goalInputActive: boolean;
  goal: ThreadGoal | null;
  goalObservedAt: number | null;
}>();

const emit = defineEmits<{
  deactivatePlan: [];
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

const showStrip = computed(() => props.planModeActive || props.goalInputActive || props.goal);

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
    <Badge
      v-if="planModeActive"
      as="div"
      variant="outline"
      class="min-w-0 max-w-full border-primary/30 pr-1 text-primary"
    >
      <span class="shrink-0">{{ $t("app.planModeActive") }}</span>
      <span v-if="planSummary" class="min-w-0 truncate text-ink-secondary">
        {{ planSummary }}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        class="-mr-0.5 size-4 text-primary hover:bg-primary/10"
        :aria-label="$t('app.deactivatePlanMode')"
        @click="emit('deactivatePlan')"
      >
        <XIcon class="size-2.5" />
      </Button>
    </Badge>
    <Badge v-if="goalInputActive" variant="outline" class="border-primary/30 text-primary">
      {{ $t("app.goalModeActive") }}
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
