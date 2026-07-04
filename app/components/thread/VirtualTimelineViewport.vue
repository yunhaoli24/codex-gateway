<script setup lang="ts">
import type { VirtualItem } from "@tanstack/virtual-core";
import type { ComponentPublicInstance } from "vue";
import { computed, onMounted, ref, watch } from "vue";
import { ChatVirtualScrollFrame, useChatVirtualizer } from "@/components/common/chat-virtualizer";
import {
  capturePrependAnchor,
  restorePrependAnchor,
  type PrependAnchor,
} from "@/components/common/chat-virtualizer/prepend-anchor";

interface TimelineViewportRow {
  key: string;
}

const props = defineProps<{
  rows: TimelineViewportRow[];
  followKey: unknown;
  estimateSize: (row: unknown, index: number) => number;
}>();

const emit = defineEmits<{
  reachStart: [];
  userDetachedChange: [detached: boolean];
}>();

const scrollFrameRef = ref<InstanceType<typeof ChatVirtualScrollFrame> | null>(null);
const rowElements = new Map<number, Element>();
const threshold = 80;

const chatVirtualizer = useChatVirtualizer({
  count: () => props.rows.length,
  threshold,
  getViewport: scrollViewport,
  getItemKey: (index: number) => props.rows[index]?.key ?? index,
  estimateSize: (index: number) => props.estimateSize(props.rows[index], index),
  getItemElement: (index: number) => rowElements.get(index),
  forgetItemElement: (index: number) => rowElements.delete(index),
  overscan: 6,
  onViewportScroll: (viewport) => {
    if (viewport.scrollTop <= 80) {
      emit("reachStart");
    }
  },
  scrollToBottom: () => {
    if (props.rows.length) {
      virtualizer.value.scrollToEnd({ behavior: "auto" });
    }
  },
});
const virtualizer = chatVirtualizer.virtualizer;

const virtualRows = chatVirtualizer.virtualItems;
const rowKeys = computed(() => props.rows.map((row) => row.key));
let pendingPrependAnchor: PrependAnchor | null = null;

function scrollViewport() {
  return scrollFrameRef.value?.getViewport() ?? null;
}

function setRowRef(refValue: Element | ComponentPublicInstance | null) {
  const element = refValue instanceof Element ? refValue : null;
  if (!element) {
    return;
  }
  const index = Number((element as HTMLElement).dataset.index);
  if (Number.isFinite(index)) {
    rowElements.set(index, element);
  }
  chatVirtualizer.measureElement(element);
  chatVirtualizer.bindInputListeners();
}

function rowStyle(_virtualRow: VirtualItem) {
  return {
    position: "absolute",
    top: "0",
    left: "0",
    width: "100%",
  } as const;
}

function resetFollowLatest() {
  chatVirtualizer.refresh();
  chatVirtualizer.reset();
}

watch(
  () => props.followKey,
  () => {
    chatVirtualizer.followContentChange();
  },
  { flush: "post" },
);

watch(
  rowKeys,
  (nextKeys, previousKeys) => {
    pendingPrependAnchor = capturePrependAnchor({
      previousKeys,
      nextKeys,
      viewport: scrollViewport(),
    });
  },
  { flush: "sync" },
);

watch(
  rowKeys,
  async () => {
    const prependAnchor = pendingPrependAnchor;
    pendingPrependAnchor = null;
    rowElements.clear();
    if (prependAnchor) {
      await restorePrependAnchor({
        anchor: prependAnchor,
        getViewport: scrollViewport,
        refresh: chatVirtualizer.refresh,
        measureVisibleItems: chatVirtualizer.measureVisibleItems,
        scrollToIndex: (index) => virtualizer.value.scrollToIndex(index, { align: "start" }),
      });
      return;
    }
    chatVirtualizer.followContentChange();
  },
  { flush: "post" },
);

watch(
  () => chatVirtualizer.userDetached.value,
  (detached) => {
    emit("userDetachedChange", detached);
  },
  { immediate: true },
);

onMounted(() => {
  chatVirtualizer.bindInputListeners();
  resetFollowLatest();
});

function handleViewportReady() {
  chatVirtualizer.refresh();
  chatVirtualizer.bindInputListeners();
  resetFollowLatest();
}

defineExpose({ resetFollowLatest });
</script>

<template>
  <ChatVirtualScrollFrame
    ref="scrollFrameRef"
    data-testid="chat-scroll-area"
    :data-follow-latest="chatVirtualizer.followLatest.value ? 'true' : 'false'"
    class="h-full min-h-0 flex-1 overflow-hidden"
    @viewport-ready="handleViewportReady"
  >
    <div
      class="mx-auto min-h-[calc(100dvh-14rem)] w-full max-w-4xl px-[clamp(0.875rem,4vw,2rem)] py-4 md:min-h-[calc(100vh-16rem)] md:py-[clamp(2rem,6vh,3rem)]"
    >
      <div :ref="chatVirtualizer.containerRef" class="relative">
        <div
          v-for="virtualRow in virtualRows"
          :key="String(virtualRow.key)"
          :ref="setRowRef"
          :data-index="virtualRow.index"
          :data-row-key="rows[virtualRow.index]?.key"
          class="pb-5 md:pb-8"
          :style="rowStyle(virtualRow)"
        >
          <slot :row="rows[virtualRow.index]" :index="virtualRow.index" />
        </div>
      </div>
    </div>
  </ChatVirtualScrollFrame>
</template>
