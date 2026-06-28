<script setup lang="ts">
import type { ScrollAreaScrollbarProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { ScrollAreaScrollbar, ScrollAreaThumb } from "reka-ui";
import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<ScrollAreaScrollbarProps & { class?: HTMLAttributes["class"] }>(),
  {
    orientation: "vertical",
  },
);

const delegatedProps = reactiveOmit(props, "class");
</script>

<template>
  <ScrollAreaScrollbar
    data-slot="scroll-area-scrollbar"
    :data-orientation="orientation"
    v-bind="delegatedProps"
    :class="
      cn(
        'flex touch-none p-px transition-colors select-none data-[orientation=horizontal]:h-2.5 data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:border-t data-[orientation=horizontal]:border-t-transparent data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2.5 data-[orientation=vertical]:border-l data-[orientation=vertical]:border-l-transparent',
        props.class,
      )
    "
  >
    <ScrollAreaThumb
      data-slot="scroll-area-thumb"
      class="relative flex-1 rounded-full bg-ink-faint/60"
    />
  </ScrollAreaScrollbar>
</template>
