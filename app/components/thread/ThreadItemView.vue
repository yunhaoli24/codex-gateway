<script setup lang="ts">
import { computed } from "vue";
import type { ThreadResponseUsage, ThreadTimelineItem } from "~~/shared/types";
import { componentForThreadItem } from "@/utils/thread-item-registry";
import type { DisplayedTurnTiming } from "@/utils/turn-timing";

const props = defineProps<{
  item: ThreadTimelineItem;
  hostId: number | null;
  threadId: string | null;
  turnId?: string | null;
  turnTiming?: DisplayedTurnTiming | null;
  responseUsage?: ThreadResponseUsage[];
  agentActionsAvailable?: boolean;
}>();

const itemComponent = computed(() => componentForThreadItem(props.item.type));
</script>

<template>
  <component
    :is="itemComponent"
    :item="item"
    :host-id="hostId"
    :thread-id="threadId"
    :turn-id="turnId"
    :turn-timing="item.type === 'agentMessage' ? turnTiming : undefined"
    :response-usage="item.type === 'agentMessage' ? responseUsage : undefined"
    :agent-actions-available="item.type === 'agentMessage' && agentActionsAvailable"
  />
</template>
