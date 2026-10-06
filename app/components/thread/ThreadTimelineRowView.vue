<script setup lang="ts">
import IntermediateStepsToggle from "@/components/thread/IntermediateStepsToggle.vue";
import ThreadItemView from "@/components/thread/ThreadItemView.vue";
import TurnDurationLabel from "@/components/thread/TurnDurationLabel.vue";
import TurnUsageAmountLabel from "@/components/thread/TurnUsageAmountLabel.vue";
import type { ThreadTimelineRow } from "@/components/thread/timeline-rows";
import { Button } from "@codex-gateway/ui/button";
const { t } = useI18n();

const props = defineProps<{
  row: ThreadTimelineRow;
  hostId: number | null;
  threadId: string | null;
}>();

const emit = defineEmits<{
  intermediateToggle: [turnId: string, open: boolean];
  loadMore: [turnId: string];
}>();

// Read the reactive row directly. App-server stream reducers update nested item proxies in place;
// cloning them into a presentation snapshot hides those deltas from Vue and prevents TanStack's
// ResizeObserver from seeing the new height. TanStack owns mounting and position, not data flow.
</script>

<template>
  <IntermediateStepsToggle
    v-if="props.row.type === 'intermediateHeader'"
    :open="props.row.open"
    :count="props.row.count"
    :loading="props.row.loading"
    @toggle="emit('intermediateToggle', props.row.turnId, $event)"
  />
  <Button
    v-else-if="props.row.type === 'loadMore'"
    variant="ghost"
    size="sm"
    data-testid="load-older-items-button"
    :disabled="props.row.loading"
    @click="emit('loadMore', props.row.turnId)"
  >
    {{ props.row.loading ? t("app.loadingOlder") : t("app.loadOlderItems") }}
  </Button>
  <ThreadItemView
    v-else-if="props.row.type === 'item'"
    :item="props.row.item"
    :host-id="hostId"
    :thread-id="threadId"
    :turn-timing="props.row.turnTiming"
    :response-usage="props.row.responseUsage"
    :agent-actions-available="props.row.agentActionsAvailable"
  />
  <div v-else class="flex items-center gap-3">
    <TurnDurationLabel :timing="props.row" />
    <TurnUsageAmountLabel :usage="props.row.responseUsage" />
  </div>
</template>
