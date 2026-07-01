import { nextTick, onBeforeUnmount, ref, type Ref } from "vue";

type ThresholdSource = number | Ref<number> | (() => number);

type VirtualStickToBottomOptions = {
  threshold?: ThresholdSource;
  getViewport: () => HTMLElement | null;
  measure: () => void;
  scrollToBottom: (viewport: HTMLElement) => void;
};

function resolveThreshold(source: ThresholdSource | undefined) {
  if (typeof source === "function") {
    return source();
  }
  if (source && typeof source === "object" && "value" in source) {
    return source.value;
  }
  return source ?? 120;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

export function useVirtualStickToBottom(options: VirtualStickToBottomOptions) {
  // This is the shared "stick to bottom unless the user scrolls away" state.
  // It is intentionally independent of any concrete virtualizer so the main
  // timeline and single-content virtual scroll areas keep identical behavior.
  const followLatest = ref(true);
  const initialBottomAligned = ref(false);
  let resizeObserver: ResizeObserver | null = null;
  let scheduledFrame: number | null = null;

  function bottomDistance(viewport = options.getViewport()) {
    if (!viewport) {
      return 0;
    }
    return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
  }

  function isNearBottom(viewport = options.getViewport()) {
    if (!viewport) {
      return false;
    }
    return bottomDistance(viewport) <= resolveThreshold(options.threshold);
  }

  async function scrollToBottom() {
    await nextTick();
    options.measure();
    await nextFrame();
    options.measure();
    const viewport = options.getViewport();
    if (viewport) {
      options.scrollToBottom(viewport);
    }
    followLatest.value = true;
    initialBottomAligned.value = true;
  }

  function reset() {
    followLatest.value = true;
    initialBottomAligned.value = false;
    void scrollToBottom();
  }

  function handleScroll(event: Event) {
    const viewport = event.target as HTMLElement;
    if (viewport !== options.getViewport()) {
      return false;
    }
    followLatest.value = isNearBottom(viewport);
    return true;
  }

  function scheduleMeasureAndStick() {
    // Content can resize after the event that triggered rendering: markdown
    // highlighting, collapsible layout, images, and streamed deltas all land
    // asynchronously. Coalesce those resizes into one frame before measuring.
    if (scheduledFrame !== null) {
      cancelAnimationFrame(scheduledFrame);
    }
    scheduledFrame = requestAnimationFrame(() => {
      scheduledFrame = null;
      options.measure();
      if (followLatest.value) {
        void scrollToBottom();
      }
    });
  }

  function observeElements(elements: Iterable<Element>) {
    // ResizeObserver is the core of the sticky behavior. It lets the viewport
    // stay pinned while content grows or shrinks, but only while followLatest
    // remains true; user scrolls are handled separately in handleScroll.
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (typeof ResizeObserver !== "function") {
      return;
    }
    resizeObserver = new ResizeObserver(scheduleMeasureAndStick);
    for (const element of elements) {
      if (element.isConnected) {
        resizeObserver.observe(element);
      }
    }
  }

  function observeElement(element: Element | null) {
    observeElements(element ? [element] : []);
  }

  function stickIfFollowing() {
    options.measure();
    if (followLatest.value) {
      void scrollToBottom();
    }
  }

  async function settleAndStick(frameCount = 4) {
    // Some containers first mount at height 0 while wrappers such as
    // CollapsibleContent and syntax highlighters settle. A few post-mount
    // frames prevent virtual rows from keeping that stale zero measurement.
    for (let index = 0; index < frameCount; index += 1) {
      await nextFrame();
      options.measure();
      if (followLatest.value) {
        const viewport = options.getViewport();
        if (viewport) {
          options.scrollToBottom(viewport);
        }
      }
    }
    if (followLatest.value) {
      initialBottomAligned.value = true;
    }
  }

  function cleanup() {
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (scheduledFrame !== null) {
      cancelAnimationFrame(scheduledFrame);
      scheduledFrame = null;
    }
  }

  onBeforeUnmount(cleanup);

  return {
    followLatest,
    initialBottomAligned,
    handleScroll,
    isNearBottom,
    observeElement,
    observeElements,
    reset,
    settleAndStick,
    scrollToBottom,
    stickIfFollowing,
  };
}
