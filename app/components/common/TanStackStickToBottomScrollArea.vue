<script setup lang="ts">
import type { ComponentPublicInstance, HTMLAttributes } from "vue";
import type { VirtualItem } from "@tanstack/virtual-core";
import { computed, onMounted, ref, watch } from "vue";
import ChatVirtualScrollFrame from "@/components/common/ChatVirtualScrollFrame.vue";
import { useDirectDomVirtualizer } from "@/composables/useDirectDomVirtualizer";
import { useVirtualStickToBottom } from "@/composables/useVirtualStickToBottom";
import { createChatVirtualizerBehavior } from "@/utils/chat-virtualizer-options";
import { shouldAdjustDetachedResize } from "@/utils/virtual-resize-adjustment";

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

const scrollFrameRef = ref<InstanceType<typeof ChatVirtualScrollFrame> | null>(null);
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

const directVirtualizer = useDirectDomVirtualizer(
  computed(() => ({
    count: 1,
    getScrollElement: scrollViewport,
    getItemKey: () => "content",
    estimateSize: () => props.estimateSize,
    overscan: 0,
    ...createChatVirtualizerBehavior({
      followLatest: sticky.followLatest.value,
      scrollEndThreshold: props.threshold,
    }),
    shouldAdjustScrollPositionOnItemSizeChange: (item: VirtualItem, _delta: number) =>
      shouldAdjustDetachedResize(
        sticky.followLatest.value,
        item,
        scrollViewport,
        () => contentRef.value,
      ),
  })),
);
const virtualizer = directVirtualizer.virtualizer;

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
  return scrollFrameRef.value?.getViewport() ?? null;
}

function bottomOffset(viewport = scrollViewport()) {
  if (!viewport) {
    return 0;
  }
  return Math.max(0, viewport.scrollHeight - viewport.clientHeight);
}

function setContentRef(refValue: Element | ComponentPublicInstance | null) {
  const element = refValue instanceof Element ? refValue : null;
  contentRef.value = element;
  sticky.bindInputListeners();
  if (!element) {
    return;
  }
  measureContent();
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
      directVirtualizer.measureElement(contentRef.value);
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
  directVirtualizer.applyDirectStyles();
}

watch(
  () => props.followKey,
  async () => {
    sticky.stickIfFollowing();
  },
  { flush: "post" },
);

onMounted(() => {
  sticky.bindInputListeners();
  sticky.reset();
  void sticky.settleAndStick();
});

function handleViewportReady() {
  directVirtualizer.refresh();
  sticky.bindInputListeners();
  sticky.stickIfFollowing();
}
</script>

<template>
  <ChatVirtualScrollFrame
    ref="scrollFrameRef"
    :class="props.class"
    :viewport-class="
      props.horizontal ? ['overflow-auto', props.viewportClass] : props.viewportClass
    "
    :style="rootStyle"
    @viewport-ready="handleViewportReady"
  >
    <div
      class="relative"
      :class="props.horizontal ? 'min-w-full w-max' : 'w-full'"
      :ref="directVirtualizer.containerRef"
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
  </ChatVirtualScrollFrame>
</template>
