<script setup lang="ts">
import { useResizeObserver } from "@vueuse/core";
import type { HTMLAttributes } from "vue";
import { nextTick, onMounted, ref, watch } from "vue";
import ChatVirtualScrollFrame from "./ChatVirtualScrollFrame.vue";
import { useStickToBottom } from "./stick-to-bottom";

const props = withDefaults(
  defineProps<{
    class?: HTMLAttributes["class"];
    viewportClass?: HTMLAttributes["class"];
    contentClass?: HTMLAttributes["class"];
    allowHorizontalOverflow?: boolean;
    threshold?: number;
    followKey?: unknown;
  }>(),
  {
    threshold: 120,
  },
);

const scrollFrameRef = ref<InstanceType<typeof ChatVirtualScrollFrame> | null>(null);
const contentRef = ref<HTMLElement | null>(null);

const sticky = useStickToBottom({
  getViewport: scrollViewport,
  threshold: () => props.threshold,
  scrollToBottom: (viewport) => {
    viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  },
});

function scrollViewport() {
  return scrollFrameRef.value?.getViewport() ?? null;
}

useResizeObserver(contentRef, () => sticky.followContentChange());

watch(
  () => props.followKey,
  async () => {
    await nextTick();
    sticky.followContentChange();
  },
  { flush: "post" },
);

onMounted(() => {
  sticky.bindInputListeners();
  sticky.reset();
  void sticky.settleAndStick();
});

function handleViewportReady() {
  sticky.bindInputListeners();
  sticky.stickIfFollowing();
}
</script>

<template>
  <ChatVirtualScrollFrame
    ref="scrollFrameRef"
    :class="props.class"
    :allow-horizontal-overflow="props.allowHorizontalOverflow"
    :viewport-class="
      props.allowHorizontalOverflow ? ['overflow-auto', props.viewportClass] : props.viewportClass
    "
    @viewport-ready="handleViewportReady"
  >
    <div
      ref="contentRef"
      :class="[props.allowHorizontalOverflow ? 'min-w-full w-max' : 'w-full', props.contentClass]"
    >
      <slot />
    </div>
  </ChatVirtualScrollFrame>
</template>
