<script setup lang="ts">
import { ScrollArea } from "@/components/ui/scroll-area";
</script>

<template>
  <ScrollArea
    data-testid="sidebar-scroll-area"
    class="sidebar-scroll-area min-h-0 min-w-0 flex-1"
    viewport-class="overflow-x-hidden"
  >
    <!--
      Reka's viewport uses an intrinsic-size content wrapper. Keep a bounded
      application wrapper inside it so an expanded tree's unbroken filename or
      thread title cannot widen every row and push trailing statuses offscreen.
    -->
    <div class="w-full min-w-0 max-w-full overflow-hidden">
      <slot />
    </div>
  </ScrollArea>
</template>

<style scoped>
.sidebar-scroll-area :deep([data-slot="scroll-area-scrollbar"]) {
  width: 0.375rem;
  border-left: 0;
  opacity: 0;
  transition:
    opacity 140ms ease,
    background-color 140ms ease;
}

.sidebar-scroll-area:hover :deep([data-slot="scroll-area-scrollbar"]) {
  opacity: 0.75;
}

.sidebar-scroll-area :deep([data-slot="scroll-area-scrollbar"]:hover) {
  opacity: 1;
}

.sidebar-scroll-area :deep([data-slot="scroll-area-thumb"]) {
  background-color: color-mix(in srgb, var(--ink-faint) 48%, transparent);
}
</style>
