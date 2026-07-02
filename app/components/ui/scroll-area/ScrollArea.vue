<script setup lang="ts">
import type { ScrollAreaRootProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { ScrollAreaCorner, ScrollAreaRoot, ScrollAreaViewport } from "reka-ui";
import { cn } from "@/lib/utils";
import ScrollBar from "./ScrollBar.vue";

const props = defineProps<
  ScrollAreaRootProps & {
    class?: HTMLAttributes["class"];
    viewportClass?: HTMLAttributes["class"];
    orientation?: "vertical" | "horizontal" | "both";
  }
>();

const delegatedProps = reactiveOmit(props, "class", "viewportClass", "orientation", "type");
</script>

<template>
  <ScrollAreaRoot
    data-slot="scroll-area"
    type="always"
    v-bind="delegatedProps"
    :class="cn('relative', props.class)"
  >
    <ScrollAreaViewport
      data-slot="scroll-area-viewport"
      :class="
        cn(
          'size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-1',
          props.viewportClass,
        )
      "
    >
      <slot />
    </ScrollAreaViewport>
    <ScrollBar v-if="props.orientation !== 'horizontal'" />
    <ScrollBar
      v-if="props.orientation === 'horizontal' || props.orientation === 'both'"
      orientation="horizontal"
    />
    <ScrollAreaCorner />
  </ScrollAreaRoot>
</template>
