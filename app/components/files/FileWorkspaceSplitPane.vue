<script setup lang="ts">
import { useDraggable } from "@vueuse/core";
import { computed, ref, useTemplateRef } from "vue";

const MIN_TREE_PERCENT = 15;
const MAX_TREE_PERCENT = 38;
const KEYBOARD_STEP_PERCENT = 2;

const container = useTemplateRef<HTMLElement>("container");
const handle = useTemplateRef<HTMLElement>("handle");
const treePercent = ref(22);
const treeStyle = computed(() => ({ flexBasis: `${treePercent.value}%` }));

useDraggable(handle, {
  axis: "x",
  containerElement: container,
  preventDefault: false,
  onMove: (_, event) => resizeFromPointer(event.clientX),
});

function resizeFromPointer(clientX: number) {
  const bounds = container.value?.getBoundingClientRect();
  if (!bounds?.width) return;
  setTreePercent(((clientX - bounds.left) / bounds.width) * 100);
}

function resizeFromKeyboard(event: KeyboardEvent) {
  const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
  if (!direction) return;
  event.preventDefault();
  setTreePercent(treePercent.value + direction * KEYBOARD_STEP_PERCENT);
}

function setTreePercent(value: number) {
  treePercent.value = Math.min(MAX_TREE_PERCENT, Math.max(MIN_TREE_PERCENT, value));
}
</script>

<template>
  <div ref="container" class="flex min-h-0 flex-1 overflow-hidden">
    <div class="flex min-w-0 shrink-0" :style="treeStyle">
      <slot name="tree" />
    </div>
    <div
      ref="handle"
      role="separator"
      tabindex="0"
      aria-orientation="vertical"
      :aria-valuemin="MIN_TREE_PERCENT"
      :aria-valuemax="MAX_TREE_PERCENT"
      :aria-valuenow="Math.round(treePercent)"
      class="group relative z-10 w-1 shrink-0 cursor-col-resize touch-none bg-hairline outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      @keydown="resizeFromKeyboard"
    >
      <span
        class="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-transparent transition-colors group-hover:bg-primary/45 group-focus-visible:bg-primary/60"
      />
    </div>
    <div class="flex min-w-0 flex-1">
      <slot name="preview" />
    </div>
  </div>
</template>
