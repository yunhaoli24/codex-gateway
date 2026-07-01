<script setup lang="ts">
import { computed } from "vue";
import { componentForThreadItem } from "@/utils/thread-item-registry";

const props = defineProps<{
  item: Record<string, any>;
  hostId: number | null;
  threadId: string | null;
  userMessageVariant?: "normal" | "steer";
}>();

const itemComponent = computed(() => componentForThreadItem(props.item.type));
</script>

<template>
  <component
    :is="itemComponent"
    v-if="itemComponent"
    :item="item"
    :host-id="hostId"
    :thread-id="threadId"
    :variant="userMessageVariant"
  />
</template>
