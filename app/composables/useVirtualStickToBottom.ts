import { nextTick, onBeforeUnmount, ref, type Ref } from "vue";

type ThresholdSource = number | Ref<number> | (() => number);

type VirtualStickToBottomOptions = {
  threshold?: ThresholdSource;
  getViewport: () => HTMLElement | null;
  measure: () => void;
  onViewportScroll?: (viewport: HTMLElement) => void;
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
  let scrollLockVersion = 0;
  let lastTouchY: number | null = null;
  let lastScrollTop: number | null = null;
  let boundViewport: HTMLElement | null = null;

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

  function markProgrammaticScroll(viewport: HTMLElement) {
    lastScrollTop = viewport.scrollTop;
  }

  function setViewportAnchor(enabled: boolean) {
    const viewport = options.getViewport();
    if (!viewport) {
      return;
    }
    if (enabled) {
      viewport.style.removeProperty("overflow-anchor");
    } else {
      viewport.style.setProperty("overflow-anchor", "none");
    }
  }

  async function scrollToBottom() {
    const version = scrollLockVersion;
    await nextTick();
    if (version !== scrollLockVersion || !followLatest.value) {
      return;
    }
    options.measure();
    await nextFrame();
    if (version !== scrollLockVersion || !followLatest.value) {
      return;
    }
    options.measure();
    const viewport = options.getViewport();
    if (viewport) {
      options.scrollToBottom(viewport);
      markProgrammaticScroll(viewport);
    }
    followLatest.value = true;
    setViewportAnchor(true);
    initialBottomAligned.value = true;
  }

  function lockToBottom() {
    followLatest.value = true;
    setViewportAnchor(true);
  }

  function reset() {
    lockToBottom();
    initialBottomAligned.value = false;
    void scrollToBottom();
  }

  function handleScroll(event: Event) {
    const viewport = event.target as HTMLElement;
    if (viewport !== options.getViewport()) {
      return false;
    }
    const currentScrollTop = viewport.scrollTop;
    if (isNearBottom(viewport)) {
      lockToBottom();
    } else if (lastScrollTop !== null && currentScrollTop < lastScrollTop) {
      detachFromBottom();
    }
    lastScrollTop = currentScrollTop;
    options.onViewportScroll?.(viewport);
    return true;
  }

  function detachFromBottom() {
    followLatest.value = false;
    setViewportAnchor(false);
    scrollLockVersion += 1;
    if (scheduledFrame !== null) {
      cancelAnimationFrame(scheduledFrame);
      scheduledFrame = null;
    }
  }

  function handleWheel(event: WheelEvent) {
    if (event.deltaY < 0) {
      detachFromBottom();
    } else if (event.deltaY > 0 && isNearBottom()) {
      lockToBottom();
    }
  }

  function handleTouchStart(event: TouchEvent) {
    lastTouchY = event.touches[0]?.clientY ?? null;
  }

  function handleTouchMove(event: TouchEvent) {
    const nextY = event.touches[0]?.clientY ?? null;
    if (lastTouchY !== null && nextY !== null && nextY > lastTouchY) {
      detachFromBottom();
    }
    lastTouchY = nextY;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (
      event.key === "ArrowUp" ||
      event.key === "PageUp" ||
      event.key === "Home" ||
      (event.key === " " && event.shiftKey)
    ) {
      detachFromBottom();
    }
  }

  function bindInputListeners() {
    const viewport = options.getViewport();
    if (!viewport || viewport === boundViewport) {
      return;
    }
    unbindInputListeners();
    boundViewport = viewport;
    if (!viewport.hasAttribute("tabindex")) {
      viewport.tabIndex = 0;
    }
    lastScrollTop = viewport.scrollTop;
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    viewport.addEventListener("wheel", handleWheel, { passive: true });
    viewport.addEventListener("touchstart", handleTouchStart, { passive: true });
    viewport.addEventListener("touchmove", handleTouchMove, { passive: true });
    viewport.addEventListener("keydown", handleKeydown);
  }

  function unbindInputListeners() {
    if (!boundViewport) {
      return;
    }
    boundViewport.removeEventListener("scroll", handleScroll);
    boundViewport.removeEventListener("wheel", handleWheel);
    boundViewport.removeEventListener("touchstart", handleTouchStart);
    boundViewport.removeEventListener("touchmove", handleTouchMove);
    boundViewport.removeEventListener("keydown", handleKeydown);
    boundViewport = null;
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
    bindInputListeners();
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
      bindInputListeners();
      options.measure();
      if (followLatest.value) {
        const viewport = options.getViewport();
        if (viewport) {
          options.scrollToBottom(viewport);
          markProgrammaticScroll(viewport);
        }
      }
    }
    if (followLatest.value) {
      initialBottomAligned.value = true;
    }
  }

  function cleanup() {
    unbindInputListeners();
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (scheduledFrame !== null) {
      cancelAnimationFrame(scheduledFrame);
      scheduledFrame = null;
    }
  }

  onBeforeUnmount(cleanup);

  return {
    bindInputListeners,
    followLatest,
    initialBottomAligned,
    isNearBottom,
    observeElement,
    observeElements,
    reset,
    settleAndStick,
    scrollToBottom,
    stickIfFollowing,
  };
}
