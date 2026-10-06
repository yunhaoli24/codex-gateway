<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { CollapsibleContent } from "@codex-gateway/ui/collapsible";
import { cn } from "@codex-gateway/ui/utils";
import { computed, useSlots } from "vue";
import { Markdown } from "vue-stream-markdown";
import "vue-stream-markdown/index.css";

interface Props {
  class?: HTMLAttributes["class"];
  content: string;
}

const props = defineProps<Props>();
const slots = useSlots();

const slotContent = computed<string | undefined>(() => {
  const nodes = slots.default?.();
  if (!Array.isArray(nodes)) {
    return undefined;
  }
  let text = "";
  for (const node of nodes) {
    if (typeof node.children === "string") text += node.children;
  }
  return text || undefined;
});

const md = computed(() => slotContent.value ?? props.content);
</script>

<template>
  <CollapsibleContent
    :class="
      cn(
        'mt-4 text-sm',
        'data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2',
        'data-[state=open]:slide-in-from-top-2 text-muted-foreground',
        'outline-none data-[state=closed]:animate-out data-[state=open]:animate-in',
        props.class,
      )
    "
  >
    <Markdown :content="md" />
  </CollapsibleContent>
</template>
