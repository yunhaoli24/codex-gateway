<script setup lang="ts">
import type { ComponentPublicInstance, HTMLAttributes } from "vue";
import { useVirtualizer, type VirtualItem, type Virtualizer } from "@tanstack/vue-virtual";
import { computed, onMounted, ref, watch } from "vue";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useVirtualStickToBottom } from "@/composables/useVirtualStickToBottom";
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
    naturalHeight?: boolean;
  }>(),
  {
    threshold: 120,
    estimateSize: 320,
  },
);

const scrollAreaRef = ref<any>(null);
const contentRef = ref<Element | null>(null);
const measuredContentHeight = ref(0);

const sticky = useVirtualStickToBottom({
  threshold: () => props.threshold,
  getViewport: scrollViewport,
  measure: measureContent,
  scrollToBottom: (viewport) => {
    virtualizer.value.scrollToOffset(bottomOffset(viewport), { behavior: "auto" });
    viewport.scrollTop = bottomOffset(viewport);
  },
});

const virtualizer = useVirtualizer(
  computed(() => ({
    count: 1,
    getScrollElement: scrollViewport,
    getItemKey: () => "content",
    estimateSize: () => props.estimateSize,
    overscan: 0,
    scrollEndThreshold: props.threshold,
    initialOffset: 0,
    shouldAdjustScrollPositionOnItemSizeChange: (
      item: VirtualItem,
      _delta: number,
      instance: Virtualizer<Element, Element>,
    ) => shouldAdjustVirtualScrollForResize(sticky.followLatest.value, item, instance),
  })),
);

const virtualRow = computed(() => virtualizer.value.getVirtualItems()[0] ?? null);
const totalSize = computed(() => virtualizer.value.getTotalSize());
// Chat subpanels have an explicit flex height, but compact command output and
// diff blocks should grow naturally until their max-height kicks in. Because
// the virtual row is absolutely positioned, it cannot otherwise size the root.
const rootStyle = computed(() =>
  props.naturalHeight
    ? { height: `${Math.max(1, measuredContentHeight.value || totalSize.value)}px` }
    : undefined,
);

function scrollViewport() {
  const root = scrollAreaRef.value?.$el ?? scrollAreaRef.value;
  return root?.querySelector?.('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
}

function bottomOffset(viewport = scrollViewport()) {
  if (!viewport) {
    return 0;
  }
  return Math.max(0, viewport.scrollHeight - viewport.clientHeight);
}

function handleScroll(event: Event) {
  sticky.handleScroll(event);
}

function setContentRef(refValue: Element | ComponentPublicInstance | null) {
  const element = refValue instanceof Element ? refValue : null;
  contentRef.value = element;
  if (!element) {
    sticky.observeElement(null);
    return;
  }
  measureContent();
  sticky.observeElement(element);
  sticky.stickIfFollowing();
  void sticky.settleAndStick();
}

function measureContent() {
  if (contentRef.value) {
    const element = contentRef.value as HTMLElement;
    // Measure the real slotted content, not the scroll viewport. This keeps the
    // single virtual row accurate even when the viewport starts collapsed.
    measuredContentHeight.value = Math.max(
      element.scrollHeight,
      element.getBoundingClientRect().height,
    );
    if (element.dataset.index !== undefined) {
      virtualizer.value.measureElement(contentRef.value);
    } else {
      // TanStack Virtual's default measureElement reads data-index from the
      // measured row. The non-virtual fallback content has no row index yet, so
      // ask the virtualizer to remeasure globally instead of emitting a warning.
      virtualizer.value.measure();
    }
  } else {
    measuredContentHeight.value = 0;
    virtualizer.value.measure();
  }
}

watch(
  () => props.followKey,
  async () => {
    sticky.stickIfFollowing();
  },
  { flush: "post" },
);

onMounted(() => {
  sticky.reset();
  void sticky.settleAndStick();
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
    :style="rootStyle"
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
          'absolute left-0 top-0',
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
