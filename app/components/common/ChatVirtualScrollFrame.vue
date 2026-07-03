<script setup lang="ts">
import type { HTMLAttributes, StyleValue } from "vue";
import { nextTick, onMounted, ref } from "vue";

const props = withDefaults(
  defineProps<{
    class?: HTMLAttributes["class"];
    viewportClass?: HTMLAttributes["class"];
    horizontal?: boolean;
    style?: StyleValue;
  }>(),
  {
    horizontal: false,
  },
);

const viewportRef = ref<HTMLElement | null>(null);
const emit = defineEmits<{
  viewportReady: [viewport: HTMLElement];
}>();

function getViewport() {
  return viewportRef.value;
}

onMounted(async () => {
  await nextTick();
  if (viewportRef.value) {
    emit("viewportReady", viewportRef.value);
  }
});

defineExpose({ getViewport });
</script>

<template>
  <div data-slot="scroll-area" :class="props.class" :style="props.style">
    <div
      ref="viewportRef"
      data-slot="scroll-area-viewport"
      :class="[
        'h-full w-full [overflow-anchor:none]',
        props.horizontal ? 'overflow-auto' : 'overflow-y-auto overflow-x-hidden',
        props.viewportClass,
      ]"
      @touchmove.stop
      @wheel.stop
    >
      <slot />
    </div>
  </div>
</template>
