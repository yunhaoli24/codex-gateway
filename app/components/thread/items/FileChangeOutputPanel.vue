<script setup lang="ts">
import { ScrollArea } from "@/components/ui/scroll-area";
import HighlightedCode from "@/components/common/HighlightedCode.vue";

defineProps<{
  output: string;
  extraClass?: string;
  streaming?: boolean;
}>();
</script>

<template>
  <ScrollArea
    :class="['h-56 rounded-lg border border-hairline bg-canvas-soft', extraClass]"
    viewport-class="overflow-auto"
    orientation="both"
  >
    <HighlightedCode
      :code="output"
      language="shell"
      :streaming="streaming"
      pre-class="syntax-highlight min-w-max whitespace-pre p-3 text-xs leading-5 text-ink-secondary"
    />
  </ScrollArea>
</template>
