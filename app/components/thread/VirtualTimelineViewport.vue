<script setup lang="ts">
import { useVirtualizer, type VirtualItem, type Virtualizer } from "@tanstack/vue-virtual";
import type { ComponentPublicInstance } from "vue";
import { computed, onMounted, ref, watch } from "vue";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useVirtualStickToBottom } from "@/composables/useVirtualStickToBottom";
import { shouldAdjustVirtualScrollForResize } from "@/utils/virtual-scroll";

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
}>();

const scrollAreaRef = ref<any>(null);
const rowElements = new Map<number, Element>();
const threshold = 120;

const sticky = useVirtualStickToBottom({
  threshold,
  getViewport: scrollViewport,
  measure: measureVisibleRows,
  scrollToBottom: () => {
    if (props.rows.length) {
      virtualizer.value.scrollToEnd({ behavior: "auto" });
    }
  },
});

const virtualizer = useVirtualizer(
  computed(() => ({
    count: props.rows.length,
    getScrollElement: scrollViewport,
    getItemKey: (index: number) => props.rows[index]?.key ?? index,
    estimateSize: (index: number) => props.estimateSize(props.rows[index], index),
    overscan: 6,
    scrollEndThreshold: threshold,
    initialOffset: 0,
    shouldAdjustScrollPositionOnItemSizeChange: (
      item: VirtualItem,
      _delta: number,
      instance: Virtualizer<Element, Element>,
    ) => shouldAdjustVirtualScrollForResize(sticky.followLatest.value, item, instance),
  })),
);

const virtualRows = computed(() => virtualizer.value.getVirtualItems());
const totalSize = computed(() => virtualizer.value.getTotalSize());

function scrollViewport() {
  const root = scrollAreaRef.value?.$el ?? scrollAreaRef.value;
  return root?.querySelector?.('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
}

function handleScroll(event: Event) {
  const viewport = event.target as HTMLElement;
  if (!sticky.handleScroll(event)) {
    return;
  }
  if (viewport.scrollTop <= 80) {
    emit("reachStart");
  }
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
  virtualizer.value.measureElement(element);
  observeRows();
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
}

function rowStyle(virtualRow: VirtualItem) {
  return {
    position: "absolute",
    top: "0",
    left: "0",
    width: "100%",
    transform: `translateY(${virtualRow.start}px)`,
  } as const;
}

function resetFollowLatest() {
  sticky.reset();
}

watch(
  () => props.followKey,
  () => {
    sticky.stickIfFollowing();
  },
  { flush: "post" },
);

watch(
  () => props.rows,
  () => {
    sticky.stickIfFollowing();
  },
  { flush: "post" },
);

onMounted(() => {
  observeRows();
  resetFollowLatest();
});

function observeRows() {
  sticky.observeElements(rowElements.values());
}

defineExpose({ resetFollowLatest });
</script>

<template>
  <ScrollArea
    ref="scrollAreaRef"
    data-testid="chat-scroll-area"
    class="h-full min-h-0 flex-1 overflow-hidden"
    @scroll.capture="handleScroll"
  >
    <div
      class="mx-auto min-h-[calc(100dvh-14rem)] w-full max-w-4xl px-[clamp(0.875rem,4vw,2rem)] py-4 md:min-h-[calc(100vh-16rem)] md:py-[clamp(2rem,6vh,3rem)]"
      :class="sticky.initialBottomAligned.value ? 'opacity-100' : 'opacity-0'"
    >
      <div class="relative" :style="{ height: `${totalSize}px` }">
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
  </ScrollArea>
</template>
