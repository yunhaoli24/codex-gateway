import type { VirtualItem } from "@tanstack/virtual-core";
import { computed, toValue, type ComponentPublicInstance, type MaybeRefOrGetter } from "vue";
import { createChatVirtualizerBehavior } from "./anchoring";
import { useDirectDomVirtualizer } from "./direct-dom-virtualizer";
import { shouldAdjustDetachedResize } from "./measurement";
import { useVirtualStickToBottom } from "./stick-to-bottom";
import type { ThresholdSource } from "./stick-to-bottom-state";

interface ChatVirtualizerOptions {
  count: MaybeRefOrGetter<number>;
  getViewport: () => HTMLElement | null;
  getItemKey: (index: number) => string | number;
  estimateSize: (index: number) => number;
  getItemElement: (index: number) => Element | null | undefined;
  threshold?: ThresholdSource;
  overscan?: MaybeRefOrGetter<number>;
  onViewportScroll?: (viewport: HTMLElement) => void;
  forgetItemElement?: (index: number) => void;
  scrollToBottom?: (viewport: HTMLElement) => void;
}

export function useChatVirtualizer(options: ChatVirtualizerOptions) {
  const threshold = () => toValue(options.threshold) ?? 120;
  const sticky = useVirtualStickToBottom({
    threshold,
    getViewport: options.getViewport,
    measure: measureVisibleItems,
    onViewportScroll: options.onViewportScroll,
    scrollToBottom: (viewport) => {
      if (options.scrollToBottom) {
        options.scrollToBottom(viewport);
        return;
      }
      virtualizer.value.scrollToOffset(bottomOffset(viewport), { behavior: "auto" });
      viewport.scrollTop = bottomOffset(viewport);
    },
  });
  const directVirtualizer = useDirectDomVirtualizer(
    computed(() => ({
      count: toValue(options.count),
      getScrollElement: options.getViewport,
      getItemKey: options.getItemKey,
      estimateSize: options.estimateSize,
      overscan: toValue(options.overscan) ?? 0,
      ...createChatVirtualizerBehavior({
        followLatest: sticky.followLatest.value,
        scrollEndThreshold: threshold(),
      }),
      shouldAdjustScrollPositionOnItemSizeChange: (item: VirtualItem, _delta: number) =>
        shouldAdjustDetachedResize(sticky.followLatest.value, item, options.getViewport, (index) =>
          options.getItemElement(index),
        ),
    })),
  );
  const virtualizer = directVirtualizer.virtualizer;
  const virtualItems = computed(() => virtualizer.value.getVirtualItems());

  function bottomOffset(viewport: HTMLElement) {
    return Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  }

  function elementFromRef(refValue: Element | ComponentPublicInstance | null) {
    return refValue instanceof Element ? refValue : null;
  }

  function measureElement(refValue: Element | ComponentPublicInstance | null) {
    const element = elementFromRef(refValue);
    if (!element) {
      return null;
    }
    const index = Number((element as HTMLElement).dataset.index);
    if (Number.isFinite(index)) {
      directVirtualizer.measureElement(element);
    } else {
      virtualizer.value.measure();
      directVirtualizer.applyDirectStyles();
    }
    sticky.bindInputListeners();
    return element;
  }

  function measureVisibleItems() {
    for (const virtualItem of virtualItems.value) {
      const element = options.getItemElement(virtualItem.index);
      if (element?.isConnected) {
        virtualizer.value.measureElement(element);
      } else {
        options.forgetItemElement?.(virtualItem.index);
      }
    }
    directVirtualizer.applyDirectStyles();
  }

  function refresh() {
    directVirtualizer.refresh();
  }

  return {
    bindInputListeners: sticky.bindInputListeners,
    containerRef: directVirtualizer.containerRef,
    followLatest: sticky.followLatest,
    followContentChange: sticky.followContentChange,
    initialBottomAligned: sticky.initialBottomAligned,
    isNearBottom: sticky.isNearBottom,
    measureElement,
    measureVisibleItems,
    refresh,
    reset: sticky.reset,
    settleAndStick: sticky.settleAndStick,
    stickIfFollowing: sticky.stickIfFollowing,
    userDetached: sticky.userDetached,
    virtualItems,
    virtualizer,
  };
}
