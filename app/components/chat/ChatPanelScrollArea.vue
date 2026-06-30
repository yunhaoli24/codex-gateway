<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { ScrollArea } from "@/components/ui/scroll-area";

defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <ScrollArea data-testid="chat-scroll-area" class="h-full min-h-0 flex-1 overflow-hidden">
    <div
      class="mx-auto min-h-[calc(100dvh-14rem)] w-full max-w-5xl px-[clamp(0.875rem,4vw,2rem)] py-4 md:min-h-[calc(100vh-16rem)] md:py-[clamp(2rem,6vh,3rem)]"
      :class="$props.class"
    >
      <slot />
    </div>
  </ScrollArea>
</template>
