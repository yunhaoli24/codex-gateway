<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ScrollArea } from "@/components/ui/scroll-area";
import { shouldAdjustVirtualScrollForResize } from "@/utils/virtual-scroll";

const props = withDefaults(
  defineProps<{
    class?: HTMLAttributes["class"];
    viewportClass?: HTMLAttributes["class"];
    contentClass?: HTMLAttributes["class"];
    horizontal?: boolean;
    threshold?: number;
    followKey?: unknown;
    estimateSize?: number;
  }>(),
  {
    threshold: 120,
    estimateSize: 320,
  },
);

const scrollAreaRef = ref<any>(null);
const contentRef = ref<Element | null>(null);
const followLatest = ref(true);
let resizeObserver: ResizeObserver | null = null;

const virtualizer = useVirtualizer(
  computed(() => ({
    count: 1,
    getScrollElement: scrollViewport,
    getItemKey: () => "content",
    estimateSize: () => props.estimateSize,
    overscan: 0,
    scrollEndThreshold: props.threshold,
    initialOffset: () => 1_000_000_000,
    shouldAdjustScrollPositionOnItemSizeChange: (item, _delta, instance) =>
      shouldAdjustVirtualScrollForResize(followLatest.value, item, instance),
  })),
);

const virtualRow = computed(() => virtualizer.value.getVirtualItems()[0] ?? null);
const totalSize = computed(() =>
  virtualRow.value ? virtualizer.value.getTotalSize() : props.estimateSize,
);

function scrollViewport() {
  const root = scrollAreaRef.value?.$el ?? scrollAreaRef.value;
  return root?.querySelector?.('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
}

function isNearBottom(viewport = scrollViewport()) {
  if (!viewport) {
    return false;
  }
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= props.threshold;
}

async function scrollToBottom() {
  await nextTick();
  measureContent();
  virtualizer.value.scrollToEnd({ behavior: "auto" });
  await new Promise((resolve) => requestAnimationFrame(resolve));
  measureContent();
}

function handleScroll(event: Event) {
  const viewport = event.target as HTMLElement;
  if (viewport !== scrollViewport()) {
    return;
  }
  followLatest.value = isNearBottom(viewport);
}

function setContentRef(element: Element | null) {
  contentRef.value = element;
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (!element) {
    return;
  }
  virtualizer.value.measureElement(element);
  if (typeof ResizeObserver !== "function") {
    return;
  }
  resizeObserver = new ResizeObserver(() => {
    measureContent();
    if (followLatest.value) {
      void scrollToBottom();
    }
  });
  resizeObserver.observe(element);
}

function measureContent() {
  if (contentRef.value) {
    virtualizer.value.measureElement(contentRef.value);
  } else {
    virtualizer.value.measure();
  }
}

watch(
  () => props.followKey,
  async () => {
    await nextTick();
    measureContent();
    if (followLatest.value) {
      void scrollToBottom();
    }
  },
  { flush: "post" },
);

onMounted(() => {
  followLatest.value = true;
  void scrollToBottom();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});
</script>

<template>
  <ScrollArea
    ref="scrollAreaRef"
    :class="props.class"
    :viewport-class="
      props.horizontal ? ['overflow-auto', props.viewportClass] : props.viewportClass
    "
    :orientation="props.horizontal ? 'both' : 'vertical'"
    @scroll.capture="handleScroll"
  >
    <div
      class="relative"
      :class="props.horizontal ? 'min-w-full w-max' : 'w-full'"
      :style="{ height: `${totalSize}px` }"
    >
      <div
        v-if="virtualRow"
        :ref="setContentRef"
        :data-index="virtualRow.index"
        :class="[
          'absolute top-0 left-0',
          props.horizontal ? 'min-w-full w-max' : 'w-full',
          props.contentClass,
        ]"
        :style="{ transform: `translateY(${virtualRow.start}px)` }"
      >
        <slot />
      </div>
      <div
        v-else
        :ref="setContentRef"
        :class="[props.horizontal ? 'min-w-full w-max' : 'w-full', props.contentClass]"
      >
        <slot />
      </div>
    </div>
  </ScrollArea>
</template>
