<script setup lang="ts">
import type { VirtualItem } from "@tanstack/virtual-core";
import type { ComponentPublicInstance } from "vue";
import { computed, onMounted, ref, watch } from "vue";
import ChatVirtualScrollFrame from "@/components/common/ChatVirtualScrollFrame.vue";
import { useDirectDomVirtualizer } from "@/composables/useDirectDomVirtualizer";
import { useVirtualStickToBottom } from "@/composables/useVirtualStickToBottom";
import { createChatVirtualizerBehavior } from "@/utils/chat-virtualizer-options";
import { shouldAdjustDetachedResize } from "@/utils/virtual-resize-adjustment";

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

const sticky = useVirtualStickToBottom({
  threshold,
  getViewport: scrollViewport,
  measure: measureVisibleRows,
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

const directVirtualizer = useDirectDomVirtualizer(
  computed(() => ({
    count: props.rows.length,
    getScrollElement: scrollViewport,
    getItemKey: (index: number) => props.rows[index]?.key ?? index,
    estimateSize: (index: number) => props.estimateSize(props.rows[index], index),
    overscan: 6,
    ...createChatVirtualizerBehavior({
      followLatest: sticky.followLatest.value,
      scrollEndThreshold: threshold,
    }),
    shouldAdjustScrollPositionOnItemSizeChange: (item: VirtualItem, _delta: number) =>
      shouldAdjustDetachedResize(sticky.followLatest.value, item, scrollViewport, (index) =>
        rowElements.get(index),
      ),
  })),
);
const virtualizer = directVirtualizer.virtualizer;

const virtualRows = computed(() => virtualizer.value.getVirtualItems());
const rowKeySignature = computed(() => props.rows.map((row) => row.key).join("\u0000"));

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
  directVirtualizer.measureElement(element);
  sticky.bindInputListeners();
}

function measureVisibleRows() {
  for (const virtualRow of virtualRows.value) {
    const element = rowElements.get(virtualRow.index);
    if (element?.isConnected) {
      virtualizer.value.measureElement(element);
    } else {
      rowElements.delete(virtualRow.index);
    }
  }
  directVirtualizer.applyDirectStyles();
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
  directVirtualizer.refresh();
  sticky.reset();
}

watch(
  () => props.followKey,
  () => {
    directVirtualizer.refresh();
    sticky.stickIfFollowing();
  },
  { flush: "post" },
);

watch(
  rowKeySignature,
  () => {
    rowElements.clear();
    directVirtualizer.refresh();
    sticky.stickIfFollowing();
  },
  { flush: "post" },
);

watch(
  () => sticky.userDetached.value,
  (detached) => {
    emit("userDetachedChange", detached);
  },
  { immediate: true },
);

onMounted(() => {
  sticky.bindInputListeners();
  resetFollowLatest();
});

function handleViewportReady() {
  directVirtualizer.refresh();
  sticky.bindInputListeners();
  resetFollowLatest();
}

defineExpose({ resetFollowLatest });
</script>

<template>
  <ChatVirtualScrollFrame
    ref="scrollFrameRef"
    data-testid="chat-scroll-area"
    :data-follow-latest="sticky.followLatest.value ? 'true' : 'false'"
    class="h-full min-h-0 flex-1 overflow-hidden"
    @viewport-ready="handleViewportReady"
  >
    <div
      class="mx-auto min-h-[calc(100dvh-14rem)] w-full max-w-4xl px-[clamp(0.875rem,4vw,2rem)] py-4 md:min-h-[calc(100vh-16rem)] md:py-[clamp(2rem,6vh,3rem)]"
    >
      <div :ref="directVirtualizer.containerRef" class="relative">
        <div
          v-for="virtualRow in virtualRows"
          :key="String(virtualRow.key)"
          :ref="setRowRef"
          :data-index="virtualRow.index"
          class="pb-5 md:pb-8"
          :style="rowStyle(virtualRow)"
        >
          <slot :row="rows[virtualRow.index]" :index="virtualRow.index" />
        </div>
      </div>
    </div>
  </ChatVirtualScrollFrame>
</template>
