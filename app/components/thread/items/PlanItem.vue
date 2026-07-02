<script setup lang="ts">
import { ListChecksIcon } from "@lucide/vue";
import { computed } from "vue";
import MarkdownContent from "@/components/common/MarkdownContent.vue";
import { threadItemText } from "@/utils/thread-items";
import PlanImplementationActions from "./PlanImplementationActions.vue";

const props = defineProps<{
  item: Record<string, any>;
  hostId: number | null;
  threadId: string | null;
}>();
const text = computed(() => threadItemText(props.item));
</script>

<template>
  <div class="max-w-4xl text-[0.9375rem] leading-8 text-ink">
    <div class="mb-2 flex items-center gap-2 text-ink-faint">
      <ListChecksIcon class="size-4" />
      <span>Plan</span>
    </div>
    <MarkdownContent :content="text" />
    <PlanImplementationActions :item="item" :host-id="hostId" :thread-id="threadId" />
  </div>
</template>
