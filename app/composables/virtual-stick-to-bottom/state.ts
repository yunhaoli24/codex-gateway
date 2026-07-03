import { ref, type Ref } from "vue";

export type ThresholdSource = number | Ref<number> | (() => number);

type StickToBottomStateOptions = {
  threshold?: ThresholdSource;
  getViewport: () => HTMLElement | null;
  onDetached?: () => void;
  onLocked?: () => void;
  onViewportScroll?: (viewport: HTMLElement) => void;
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

export function createStickToBottomState(options: StickToBottomStateOptions) {
  const followLatest = ref(true);
  const initialBottomAligned = ref(false);
  let version = 0;
  let lastTouchY: number | null = null;
  let lastScrollTop: number | null = null;

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

  function markProgrammaticScroll(viewport: HTMLElement) {
    lastScrollTop = viewport.scrollTop;
  }

  function lockToBottom() {
    followLatest.value = true;
    setViewportAnchor(true);
    options.onLocked?.();
  }

  function detachFromBottom() {
    followLatest.value = false;
    setViewportAnchor(false);
    version += 1;
    options.onDetached?.();
  }

  function reset() {
    lockToBottom();
    initialBottomAligned.value = false;
  }

  function currentVersion() {
    return version;
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

  function setLastScrollTop(viewport: HTMLElement) {
    lastScrollTop = viewport.scrollTop;
  }

  return {
    currentVersion,
    followLatest,
    handleKeydown,
    handleScroll,
    handleTouchMove,
    handleTouchStart,
    handleWheel,
    initialBottomAligned,
    isNearBottom,
    lockToBottom,
    markProgrammaticScroll,
    reset,
    setLastScrollTop,
  };
}
