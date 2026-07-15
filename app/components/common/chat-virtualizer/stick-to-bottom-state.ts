import { ref, type Ref } from "vue";

export type ThresholdSource = number | Ref<number> | (() => number);

type StickToBottomStateOptions = {
  threshold?: ThresholdSource;
  getViewport: () => HTMLElement | null;
  onDetached?: () => void;
  onLocked?: () => void;
  onViewportScroll?: (viewport: HTMLElement) => void;
};

const DETACH_FROM_BOTTOM_KEYS = new Set(["ArrowUp", "PageUp", "Home"]);
const MOVE_TOWARD_BOTTOM_KEYS = new Set(["ArrowDown", "PageDown", "End"]);

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
  const userDetached = ref(false);
  let version = 0;
  let lastTouchY: number | null = null;
  let detachedByUser = false;
  let userDirection: "backward" | "forward" | null = null;

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

  function disableNativeScrollAnchor() {
    const viewport = options.getViewport();
    if (!viewport) {
      return;
    }
    viewport.style.setProperty("overflow-anchor", "none");
  }

  function lockToBottom() {
    followLatest.value = true;
    detachedByUser = false;
    userDirection = null;
    userDetached.value = false;
    disableNativeScrollAnchor();
    options.onLocked?.();
  }

  function detachFromBottom() {
    followLatest.value = false;
    detachedByUser = true;
    userDirection = "backward";
    userDetached.value = true;
    disableNativeScrollAnchor();
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
    if (isNearBottom(viewport) && (!detachedByUser || userDirection === "forward")) {
      // Virtual-core changes scrollTop while preserving a keyed prepend anchor.
      // That programmatic movement can be downward, but it is not permission to
      // resume following. Do not infer reader intent from scroll delta alone;
      // only the wheel/touch/keyboard handlers below may mark forward intent.
      lockToBottom();
    }
    options.onViewportScroll?.(viewport);
    return true;
  }

  function handleWheel(event: WheelEvent) {
    if (event.deltaY < 0) {
      detachFromBottom();
    } else if (event.deltaY > 0) {
      userDirection = "forward";
      if (isNearBottom()) lockToBottom();
    }
  }

  function handleTouchStart(event: TouchEvent) {
    lastTouchY = event.touches[0]?.clientY ?? null;
  }

  function handleTouchMove(event: TouchEvent) {
    const nextY = event.touches[0]?.clientY ?? null;
    if (lastTouchY !== null && nextY !== null && nextY > lastTouchY) {
      detachFromBottom();
    } else if (lastTouchY !== null && nextY !== null && nextY < lastTouchY) {
      userDirection = "forward";
      if (isNearBottom()) lockToBottom();
    }
    lastTouchY = nextY;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (DETACH_FROM_BOTTOM_KEYS.has(event.key) || (event.key === " " && event.shiftKey)) {
      detachFromBottom();
    } else if (MOVE_TOWARD_BOTTOM_KEYS.has(event.key) || (event.key === " " && !event.shiftKey)) {
      userDirection = "forward";
      if (isNearBottom()) lockToBottom();
    }
  }

  function prepareViewport() {
    disableNativeScrollAnchor();
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
    prepareViewport,
    reset,
    userDetached,
  };
}
