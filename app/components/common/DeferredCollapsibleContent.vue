<script setup lang="ts">
import { CollapsibleContent } from "@/components/ui/collapsible";

defineProps<{
  open: boolean;
}>();
</script>

<template>
  <!--
    Reka owns the disclosure semantics, but explicitly gate the slot so expensive Markdown,
    syntax highlighting, and nested scroll areas do not enter Vue's component tree while closed.
    This matters for long agent turns containing hundreds of collapsed command/tool cards.
  -->
  <CollapsibleContent v-if="open">
    <slot />
  </CollapsibleContent>
</template>
