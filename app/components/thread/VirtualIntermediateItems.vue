<script setup lang="ts">
import type { VirtualItem } from "@tanstack/virtual-core";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { useMutationObserver, useResizeObserver } from "@vueuse/core";
import type { ComponentPublicInstance } from "vue";
import { computed, nextTick, onMounted, ref, shallowRef, watch } from "vue";
import ThreadItemView from "@/components/thread/ThreadItemView.vue";
import { itemKey } from "@/components/thread/thread-turn-sections";
import { useTimelineViewport } from "@/components/thread/timeline-viewport-context";

const props = defineProps<{
  items: any[];
  hostId: number | null;
  threadId: string | null;
  userMessageVariant: (item: any) => "normal" | "steer";
}>();

const getViewport = useTimelineViewport();
const containerElement = ref<HTMLElement | null>(null);
const outerTurnRow = shallowRef<HTMLElement | null>(null);
const scrollMargin = ref(0);

const virtualizer = useVirtualizer(
  computed(() => ({
    count: props.items.length,
    getScrollElement: getViewport,
    getItemKey: (index: number) => itemKey(props.items[index], "middle", index),
    estimateSize: (index: number) => estimateIntermediateItem(props.items[index]),
    overscan: 5,
    scrollMargin: scrollMargin.value,
    // TanStack's official RAF mode prevents a measured inner row from resizing the outer turn
    // during the same WebKit ResizeObserver delivery cycle.
    useAnimationFrameWithResizeObserver: true,
  })),
);
const virtualItems = computed(() => virtualizer.value.getVirtualItems());
const totalSize = computed(() => virtualizer.value.getTotalSize());

function setContainerRef(refValue: Element | ComponentPublicInstance | null) {
  const element = refValue instanceof HTMLElement ? refValue : null;
  if (containerElement.value === element) return;
  containerElement.value = element;
  outerTurnRow.value = element?.closest<HTMLElement>("[data-row-key]") ?? null;
  void updateScrollMargin();
}

function setItemRef(refValue: Element | ComponentPublicInstance | null) {
  const element = refValue instanceof Element ? refValue : null;
  if (element) virtualizer.value.measureElement(element);
}

function itemStyle(virtualItem: VirtualItem) {
  return {
    position: "absolute",
    top: "0",
    left: "0",
    width: "100%",
    transform: `translate3d(0, ${virtualItem.start - scrollMargin.value}px, 0)`,
  } as const;
}

async function updateScrollMargin() {
  await nextTick();
  const viewport = getViewport();
  const container = containerElement.value;
  if (!viewport || !container) return;
  const nextMargin =
    container.getBoundingClientRect().top -
    viewport.getBoundingClientRect().top +
    viewport.scrollTop;
  if (Math.abs(nextMargin - scrollMargin.value) < 0.5) return;
  scrollMargin.value = nextMargin;
}

useResizeObserver(() => getViewport(), updateScrollMargin);
useMutationObserver(outerTurnRow, updateScrollMargin, {
  attributes: true,
  attributeFilter: ["style"],
});

watch(
  () => props.items.map((item, index) => itemKey(item, "middle", index)).join("\0"),
  () => void updateScrollMargin(),
  { flush: "post" },
);

onMounted(() => void updateScrollMargin());

function estimateIntermediateItem(item: any) {
  switch (item?.type) {
    case "commandExecution":
      return 48;
    case "fileChange":
      return 440;
    case "agentMessage":
      return 144;
    case "reasoning":
      return 128;
    default:
      return 96;
  }
}
</script>

<template>
  <!--
    The outer timeline virtualizes turns. A single long-running turn can still contain hundreds of
    intermediate items, so this nested virtualizer shares the outer scroll element and only mounts
    visible item components. Do not add overflow here: command/diff cards keep their own bounded
    scrollers, while the Agent timeline remains the only owner of vertical navigation and
    follow-latest intent. In particular, this component must not infer user detachment from its
    own range changes; the shared viewport's wheel/touch/keyboard state owns that decision.

    Do not observe this container's height or the containing turn row's height. Inner measurements
    resize both elements, and feeding that resize back into scrollMargin creates a nested
    ResizeObserver cycle on WebKit. The viewport observer owns actual viewport geometry changes;
    the outer row's transform observer owns movement caused by the turn virtualizer.
  -->
  <div
    :ref="setContainerRef"
    class="relative"
    :style="{ height: `${totalSize}px` }"
    data-testid="virtual-intermediate-items"
  >
    <div
      v-for="virtualItem in virtualItems"
      :key="String(virtualItem.key)"
      :ref="setItemRef"
      :data-index="virtualItem.index"
      class="pb-5"
      :style="itemStyle(virtualItem)"
    >
      <ThreadItemView
        :item="items[virtualItem.index]"
        :host-id="hostId"
        :thread-id="threadId"
        :user-message-variant="userMessageVariant(items[virtualItem.index])"
      />
    </div>
  </div>
</template>
