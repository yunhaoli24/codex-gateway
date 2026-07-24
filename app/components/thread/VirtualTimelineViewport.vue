<script setup lang="ts">
import type { VirtualItem } from "@tanstack/virtual-core";
import {
  useDocumentVisibility,
  useElementVisibility,
  useEventListener,
  useResizeObserver,
} from "@vueuse/core";
import type { ComponentPublicInstance } from "vue";
import { computed, onMounted, ref, watch } from "vue";
import { ChatVirtualScrollFrame, useChatVirtualizer } from "@/components/common/chat-virtualizer";
import { provideTimelineViewport } from "@/components/thread/timeline-viewport-context";

interface TimelineViewportRow {
  key: string;
}

const props = defineProps<{
  rows: TimelineViewportRow[];
  followKey: unknown;
  estimateSize: (row: unknown, index: number) => number;
  deferNestedRowMeasurement?: boolean;
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
  // Only timelines that contain a second virtualizer defer outer row measurement. Enabling this
  // globally delays the synchronous keyed-anchor restore used by ordinary detached readers.
  useAnimationFrameWithResizeObserver: () => props.deferNestedRowMeasurement ?? false,
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
    // Keep bottom alignment in TanStack's coordinate system. A history prepend
    // first expands the DOM sizer with estimated rows and then replaces those
    // estimates with mobile-width measurements. Writing viewport.scrollTop from
    // the intermediate DOM scrollHeight loses the keyed end anchor and moves the
    // previously visible latest row. Do not replace this with direct scrollHeight
    // arithmetic; scrollToEnd lets virtual-core apply the prepend and measurement
    // deltas as one end-anchored transaction.
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

provideTimelineViewport(scrollViewport);

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
  if (chatVirtualizer.followLatest.value) {
    // Mobile browsers resize 100dvh as their toolbar settles. Waiting for the
    // detached-reader two-frame reflow lets the new viewport paint off-bottom
    // and then snap back. Pinned readers only need the synchronous chat follow
    // path; detached readers still require the keyed anchor flow below.
    chatVirtualizer.followContentChange();
    return;
  }
  void chatVirtualizer.reflow({ preserveViewport: true });
}

useResizeObserver(viewportElement, reflowPreservingViewport);
useEventListener(
  () => (import.meta.client ? window.visualViewport : null),
  "resize",
  reflowPreservingViewport,
);
// Do not also subscribe to window.resize. visualViewport reports mobile toolbar
// geometry first, while the element observer owns the final layout; a third
// duplicate source can follow an unrelated later content transaction.
useResizeObserver(chatVirtualizer.containerElement, () => {
  if (!chatVirtualizer.followLatest.value) return;

  // TanStack updates the direct-DOM sizer only after estimated row heights
  // become real measurements. Following that notification keeps pinned
  // prepend/viewport reflow correction in the same pre-paint layout phase.
  //
  // Do not synchronously remeasure rows here: that bypasses virtual-core's
  // keyed transaction. Detached intent is retained by the input state machine,
  // so this callback can trust followLatest without a second transaction flag.
  // Do not defer with RAF; the stale bottom would already have painted.
  chatVirtualizer.followContentChange();
});

watch(
  () => props.rows.map((row) => row.key).join("\0"),
  () => {
    if (chatVirtualizer.followLatest.value) {
      // Prepending measured history is not an append, so followOnAppend does
      // not own this transaction. Run one post-flush follow after Vue has
      // mounted and measured the new rows; this prevents narrow mobile rows
      // from painting at estimated offsets before TanStack's later correction.
      chatVirtualizer.followContentChange();
    }
  },
  { flush: "post" },
);

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
    // `followKey` changes for every streamed token. It is a content-invalidating
    // signal, not an instruction to resume following: a reader who explicitly
    // scrolled upward must keep the exact viewport while the Agent keeps writing.
    // Reflow/measurement for detached readers is handled by the keyed-anchor
    // paths above, so only the already-pinned state may advance to the latest row.
    if (chatVirtualizer.followLatest.value) {
      chatVirtualizer.followContentChange();
    }
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
      Keep trailing spacing inside every measured row. Do not put top spacing
      on `first:*`: after a prepend the old anchor row stops being first, so its
      content moves inside an otherwise stable keyed row. Padding around the
      sizer is also invisible to virtual-core and creates a false scroll range.
    -->
    <div class="mx-auto flex min-h-full w-full max-w-4xl flex-col px-[clamp(0.875rem,4vw,2rem)]">
      <div :ref="chatVirtualizer.containerRef" class="relative mt-auto shrink-0">
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
