<script setup lang="ts">
import { XIcon } from "@lucide/vue";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { ThreadGoal } from "~~/shared/types";
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

const modeItems = computed(() =>
  [
    props.planModeActive
      ? {
          kind: "plan",
          label: "app.planModeActive",
          text: props.planSummary,
        }
      : null,
    props.goalInputActive
      ? {
          kind: "goal-input",
          label: "app.goalModeActive",
          text: "app.goalInputHint",
        }
      : null,
    visibleGoal.value
      ? {
          kind: "goal",
          label: "app.goalModeActive",
          text: visibleGoal.value.objective,
          metric: formatGoalMetric(visibleGoal.value.tokensUsed, activeGoalElapsedSeconds.value),
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
);
const showStrip = computed(() => modeItems.value.length > 0);

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

function formatGoalMetric(tokensUsed: number, elapsedSeconds: number) {
  return `${formatElapsed(elapsedSeconds)} · ${tokensUsed.toLocaleString()} tokens`;
}
</script>

<template>
  <div
    v-if="showStrip"
    data-testid="composer-mode-ticker"
    class="relative mb-2 overflow-hidden rounded-2xl border border-hairline bg-surface/90 shadow-sm shadow-ink/5"
  >
    <div class="composer-mode-ticker-track flex w-max items-center gap-3 py-2 pr-12">
      <template v-for="copy in 2" :key="copy">
        <div
          v-for="item in modeItems"
          :key="`${copy}-${item.kind}`"
          class="inline-flex min-w-max items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm text-ink md:text-base"
        >
          <span class="font-medium text-primary">{{ $t(item.label) }}</span>
          <span v-if="item.text" class="text-ink-secondary">
            {{ item.text.startsWith("app.") ? $t(item.text) : item.text }}
          </span>
          <span v-if="'metric' in item && item.metric" class="font-mono text-ink-muted">
            {{ item.metric }}
          </span>
        </div>
      </template>
    </div>
    <div
      v-if="planModeActive"
      class="absolute inset-y-0 right-0 flex items-center bg-gradient-to-l from-surface via-surface to-transparent pl-6 pr-2"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        class="size-6 rounded-full text-primary hover:bg-primary/10"
        :aria-label="$t('app.deactivatePlanMode')"
        @click="emit('deactivatePlan')"
      >
        <XIcon class="size-3.5" />
      </Button>
    </div>
  </div>
</template>

<style scoped>
.composer-mode-ticker-track {
  animation: composer-mode-ticker 24s linear infinite;
}

.composer-mode-ticker-track:hover {
  animation-play-state: paused;
}

@keyframes composer-mode-ticker {
  from {
    transform: translateX(0);
  }

  to {
    transform: translateX(-50%);
  }
}
</style>
