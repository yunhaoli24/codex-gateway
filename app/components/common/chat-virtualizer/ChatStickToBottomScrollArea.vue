<script setup lang="ts">
import type { ComponentPublicInstance, HTMLAttributes } from "vue";
import { computed, onMounted, ref, watch } from "vue";
import ChatVirtualScrollFrame from "./ChatVirtualScrollFrame.vue";
import { useChatVirtualizer } from "./useChatVirtualizer";

const props = withDefaults(
  defineProps<{
    class?: HTMLAttributes["class"];
    viewportClass?: HTMLAttributes["class"];
    contentClass?: HTMLAttributes["class"];
    allowHorizontalOverflow?: boolean;
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

const chatVirtualizer = useChatVirtualizer({
  count: 1,
  getViewport: scrollViewport,
  getItemKey: () => "content",
  estimateSize: () => props.estimateSize,
  getItemElement: () => contentRef.value,
  threshold: () => props.threshold,
});
const virtualizer = chatVirtualizer.virtualizer;

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

function setContentRef(refValue: Element | ComponentPublicInstance | null) {
  const element = chatVirtualizer.measureElement(refValue);
  contentRef.value = element;
  if (!element) {
    return;
  }
  measureContent();
  chatVirtualizer.stickIfFollowing();
  void chatVirtualizer.settleAndStick();
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
      chatVirtualizer.measureElement(contentRef.value);
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
  chatVirtualizer.measureVisibleItems();
}

watch(
  () => props.followKey,
  async () => {
    chatVirtualizer.stickIfFollowing();
  },
  { flush: "post" },
);

onMounted(() => {
  chatVirtualizer.bindInputListeners();
  chatVirtualizer.reset();
  void chatVirtualizer.settleAndStick();
});

function handleViewportReady() {
  chatVirtualizer.refresh();
  chatVirtualizer.bindInputListeners();
  chatVirtualizer.stickIfFollowing();
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
    :style="rootStyle"
    @viewport-ready="handleViewportReady"
  >
    <div
      class="relative"
      :class="props.allowHorizontalOverflow ? 'min-w-full w-max' : 'w-full'"
      :ref="chatVirtualizer.containerRef"
    >
      <div
        v-if="virtualRow"
        :ref="setContentRef"
        :data-index="virtualRow.index"
        :class="[
          'absolute left-0 top-0',
          props.allowHorizontalOverflow ? 'min-w-full w-max' : 'w-full',
          props.contentClass,
        ]"
      >
        <slot />
      </div>
      <div
        v-else
        :ref="setContentRef"
        :class="[
          props.allowHorizontalOverflow ? 'min-w-full w-max' : 'w-full',
          props.contentClass,
        ]"
      >
        <slot />
      </div>
    </div>
  </ChatVirtualScrollFrame>
</template>
