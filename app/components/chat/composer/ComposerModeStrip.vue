<script setup lang="ts">
import { useTimestamp } from "@vueuse/core";
import { XIcon } from "@lucide/vue";
import { computed, watch } from "vue";
import type { ThreadGoal } from "~~/shared/types";
import ComposerGoalDetailsDialog from "@/components/chat/composer/ComposerGoalDetailsDialog.vue";
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

const { timestamp: now, pause, resume } = useTimestamp({ controls: true, interval: 250 });

const visibleGoal = computed(() => (props.goal?.status === "active" ? props.goal : null));
const activeGoalElapsedSeconds = computed(() => {
  if (!visibleGoal.value) {
    return 0;
  }
  const observedDelta = props.goalObservedAt
    ? Math.max(0, (now.value - props.goalObservedAt) / 1000)
    : 0;
  return visibleGoal.value.timeUsedSeconds + observedDelta;
});

const goalTokensLabel = computed(() =>
  visibleGoal.value ? `${visibleGoal.value.tokensUsed.toLocaleString()} tokens` : "",
);
const goalBudgetLabel = computed(() => {
  const budget = visibleGoal.value?.tokenBudget;
  return budget === null || budget === undefined ? "∞" : budget.toLocaleString();
});
const goalElapsedLabel = computed(() => formatElapsed(activeGoalElapsedSeconds.value));
const showStrip = computed(
  () => props.planModeActive || props.goalInputActive || visibleGoal.value,
);

watch(visibleGoal, (goal) => (goal ? resume() : pause()), { immediate: true });

function formatElapsed(seconds: number) {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}
</script>

<template>
  <div v-if="showStrip" data-testid="composer-mode-strip" class="mb-2 space-y-2">
    <div
      v-if="planModeActive"
      class="flex min-w-0 items-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-ink shadow-sm shadow-ink/5 md:text-base"
    >
      <span class="shrink-0 font-medium text-primary">{{ $t("app.planModeActive") }}</span>
      <span v-if="planSummary" class="min-w-0 flex-1 truncate text-ink-secondary">
        {{ planSummary }}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        class="size-6 shrink-0 rounded-full text-primary hover:bg-primary/10"
        :aria-label="$t('app.deactivatePlanMode')"
        @click="emit('deactivatePlan')"
      >
        <XIcon class="size-3.5" />
      </Button>
    </div>

    <div
      v-if="goalInputActive"
      class="flex min-w-0 items-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-ink shadow-sm shadow-ink/5 md:text-base"
    >
      <span class="shrink-0 font-medium text-primary">{{ $t("app.goalModeActive") }}</span>
      <span class="min-w-0 truncate text-ink-secondary">{{ $t("app.goalInputHint") }}</span>
    </div>

    <ComposerGoalDetailsDialog
      v-if="visibleGoal"
      :goal="visibleGoal"
      :elapsed-label="goalElapsedLabel"
      :tokens-label="goalTokensLabel"
      :budget-label="goalBudgetLabel"
    />
  </div>
</template>
