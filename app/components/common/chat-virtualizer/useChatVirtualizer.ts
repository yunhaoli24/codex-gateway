import {
  computed,
  nextTick,
  toValue,
  type ComponentPublicInstance,
  type MaybeRefOrGetter,
} from "vue";
import { createChatVirtualizerBehavior } from "./anchoring";
import { useDirectDomVirtualizer } from "./direct-dom-virtualizer";
import { useStickToBottom } from "./stick-to-bottom";
import type { ThresholdSource } from "./stick-to-bottom-state";
import { captureViewportRowAnchor, findViewportRowByKey } from "./viewport-anchor";

interface ChatVirtualizerOptions {
  count: MaybeRefOrGetter<number>;
  getViewport: () => HTMLElement | null;
  getItemKey: (index: number) => string | number;
  estimateSize: (index: number) => number;
  threshold?: ThresholdSource;
  overscan?: MaybeRefOrGetter<number>;
  onViewportScroll?: (viewport: HTMLElement) => void;
  scrollToBottom?: (viewport: HTMLElement) => void;
}

export function useChatVirtualizer(options: ChatVirtualizerOptions) {
  let reflowGeneration = 0;
  const threshold = () => toValue(options.threshold) ?? 120;
  const sticky = useStickToBottom({
    threshold,
    getViewport: options.getViewport,
    measure: measureVisibleItems,
    onViewportScroll: options.onViewportScroll,
    scrollToBottom,
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
    })),
  );
  const virtualizer = directVirtualizer.virtualizer;
  const virtualItems = computed(() => virtualizer.value.getVirtualItems());

  function bottomOffset(viewport: HTMLElement) {
    return Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  }

  function scrollToBottom(viewport: HTMLElement) {
    if (options.scrollToBottom) {
      options.scrollToBottom(viewport);
      return;
    }
    virtualizer.value.scrollToOffset(bottomOffset(viewport), { behavior: "auto" });
    viewport.scrollTop = bottomOffset(viewport);
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
      const element = virtualizer.value.elementsCache.get(virtualItem.key);
      if (element?.isConnected) {
        virtualizer.value.measureElement(element);
      }
    }
    directVirtualizer.applyDirectStyles();
  }

  function refresh() {
    directVirtualizer.refresh();
  }

  async function reflow(reflowOptions: { preserveViewport?: boolean } = {}) {
    const generation = ++reflowGeneration;
    const viewport = options.getViewport();
    const anchor =
      reflowOptions.preserveViewport === false ? null : captureViewportRowAnchor(viewport);
    const scrollTop = viewport?.scrollTop ?? 0;

    await nextTick();
    for (let frame = 0; frame < 2; frame += 1) {
      await nextFrame();
      if (generation !== reflowGeneration) return;
      // Visibility restoration only invalidates DOM placement. Preserve the
      // size cache and explicitly remeasure mounted rows below; clearing every
      // row here would start a second anchor-compensation cascade.
      directVirtualizer.refresh({ forceStyles: frame === 0, remeasure: false });
      measureVisibleItems();
    }

    const currentViewport = options.getViewport();
    if (!currentViewport || generation !== reflowGeneration) return;
    if (sticky.followLatest.value) {
      scrollToBottom(currentViewport);
      return;
    }
    const anchorElement = anchor ? findViewportRowByKey(currentViewport, anchor.key) : null;
    if (anchorElement && anchor) {
      currentViewport.scrollTop += anchorElement.getBoundingClientRect().top - anchor.top;
    } else {
      currentViewport.scrollTop = scrollTop;
    }
    directVirtualizer.refresh({ forceStyles: true, remeasure: false });
    measureVisibleItems();
  }

  return {
    bindInputListeners: sticky.bindInputListeners,
    containerElement: directVirtualizer.containerElement,
    containerRef: directVirtualizer.containerRef,
    followLatest: sticky.followLatest,
    followContentChange: sticky.followContentChange,
    initialBottomAligned: sticky.initialBottomAligned,
    isNearBottom: sticky.isNearBottom,
    measureElement,
    measureVisibleItems,
    refresh,
    reflow,
    reset: sticky.reset,
    settleAndStick: sticky.settleAndStick,
    stickIfFollowing: sticky.stickIfFollowing,
    userDetached: sticky.userDetached,
    virtualItems,
    virtualizer,
  };
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
