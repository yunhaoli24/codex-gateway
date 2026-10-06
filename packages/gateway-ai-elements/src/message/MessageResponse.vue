<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@codex-gateway/ui/utils";
import { computed, useSlots } from "vue";
import { Markdown } from "vue-stream-markdown";
import "vue-stream-markdown/index.css";

interface Props {
  content?: string;
  class?: HTMLAttributes["class"];
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

// Markdown 2 uses Comark and makes heavy renderers opt-in. Business messages already use the
// browser runtime's MarkdownContent; this generic shell needs only the upstream core renderer.
const md = computed(() => slotContent.value ?? props.content ?? "");
</script>

<template>
  <Markdown
    :content="md"
    :class="cn('size-full [&>*:first-child]:mt-0! [&>*:last-child]:mb-0!', props.class)"
    v-bind="$attrs"
  />
</template>
