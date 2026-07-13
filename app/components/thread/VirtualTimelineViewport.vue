<script setup lang="ts">
import type { VirtualItem } from "@tanstack/virtual-core";
import { useDocumentVisibility, useElementVisibility, useResizeObserver } from "@vueuse/core";
import type { ComponentPublicInstance } from "vue";
import { computed, onMounted, ref, watch } from "vue";
import { ChatVirtualScrollFrame, useChatVirtualizer } from "@/components/common/chat-virtualizer";

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
const threshold = 80;
const startControlsVisible = ref(false);

const chatVirtualizer = useChatVirtualizer({
  count: () => props.rows.length,
  threshold,
  getViewport: scrollViewport,
  getItemKey: (index: number) => props.rows[index]?.key ?? index,
  estimateSize: (index: number) => props.estimateSize(props.rows[index], index),
  overscan: 6,
  onViewportScroll: (viewport) => {
    // A short chat is simultaneously at the top and bottom. Only interpret
    // top proximity as history intent after explicit upward input detached the
    // outer timeline; otherwise initial bottom alignment races background top-up.
    const reachedStart = chatVirtualizer.userDetached.value && viewport.scrollTop <= threshold;
    startControlsVisible.value = reachedStart;
    if (reachedStart) {
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
const viewportElement = computed(() => scrollViewport());
const viewportVisible = useElementVisibility(viewportElement);
const documentVisibility = useDocumentVisibility();

function scrollViewport() {
  return scrollFrameRef.value?.getViewport() ?? null;
}

function setRowRef(refValue: Element | ComponentPublicInstance | null) {
  const element = refValue instanceof Element ? refValue : null;
  if (!element) {
    return;
  }
  const index = Number((element as HTMLElement).dataset.index);
  if (Number.isFinite(index)) chatVirtualizer.measureElement(element);
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

function reflowPreservingViewport() {
  void chatVirtualizer.reflow({ preserveViewport: true });
}

useResizeObserver(viewportElement, reflowPreservingViewport);

watch(viewportVisible, (visible, previous) => {
  if (visible && previous === false) reflowPreservingViewport();
});

watch(documentVisibility, (visibility, previous) => {
  if (visibility === "visible" && previous !== "visible") reflowPreservingViewport();
});

watch(
  () => props.followKey,
  () => {
    startControlsVisible.value = false;
    chatVirtualizer.followContentChange();
  },
  { flush: "post" },
);

watch(
  () => chatVirtualizer.userDetached.value,
  (detached) => {
    if (!detached) startControlsVisible.value = false;
    emit("userDetachedChange", detached);
  },
  { immediate: true },
);

onMounted(() => {
  chatVirtualizer.bindInputListeners();
  resetFollowLatest();
  void chatVirtualizer.reflow({ preserveViewport: false });
});

function handleViewportReady() {
  chatVirtualizer.refresh();
  chatVirtualizer.bindInputListeners();
  resetFollowLatest();
  void chatVirtualizer.reflow({ preserveViewport: false });
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
    <div class="pointer-events-none sticky top-0 z-10 h-0">
      <slot name="overlay" :visible="startControlsVisible" />
    </div>
    <!--
      Keep vertical spacing inside measured rows. Padding around TanStack's
      sizer is invisible to virtual-core and creates a false scroll range when
      a short, bottom-aligned chat grows past one viewport during prepend.
    -->
    <div class="mx-auto flex min-h-full w-full max-w-4xl flex-col px-[clamp(0.875rem,4vw,2rem)]">
      <div :ref="chatVirtualizer.containerRef" class="relative mt-auto shrink-0">
        <div
          v-for="virtualRow in virtualRows"
          :key="String(virtualRow.key)"
          :ref="setRowRef"
          :data-index="virtualRow.index"
          :data-row-key="rows[virtualRow.index]?.key"
          class="pb-5 first:pt-4 md:pb-8 md:first:pt-8"
          :style="rowStyle(virtualRow)"
        >
          <slot :row="rows[virtualRow.index]" :index="virtualRow.index" />
        </div>
      </div>
    </div>
  </ChatVirtualScrollFrame>
</template>
