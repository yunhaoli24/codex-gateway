import { nextTick, onBeforeUnmount } from "vue";
import { createStickToBottomState, type ThresholdSource } from "./stick-to-bottom-state";
import { createViewportInputIntent } from "./viewport-input-intent";

type VirtualStickToBottomOptions = {
  threshold?: ThresholdSource;
  getViewport: () => HTMLElement | null;
  measure: () => void;
  onViewportScroll?: (viewport: HTMLElement) => void;
  scrollToBottom: (viewport: HTMLElement) => void;
};

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

export function useVirtualStickToBottom(options: VirtualStickToBottomOptions) {
  const state = createStickToBottomState({
    threshold: options.threshold,
    getViewport: options.getViewport,
    onViewportScroll: options.onViewportScroll,
  });
  const inputIntent = createViewportInputIntent({
    getViewport: options.getViewport,
    onBound: state.setLastScrollTop,
    onKeydown: state.handleKeydown,
    onScroll: state.handleScroll,
    onTouchMove: state.handleTouchMove,
    onTouchStart: state.handleTouchStart,
    onWheel: state.handleWheel,
  });

  async function scrollToBottom() {
    const version = state.currentVersion();
    await nextTick();
    if (version !== state.currentVersion() || !state.followLatest.value) {
      return;
    }
    options.measure();
    await nextFrame();
    if (version !== state.currentVersion() || !state.followLatest.value) {
      return;
    }
    options.measure();
    const viewport = options.getViewport();
    if (viewport) {
      options.scrollToBottom(viewport);
      state.markProgrammaticScroll(viewport);
    }
    state.lockToBottom();
    state.initialBottomAligned.value = true;
  }

  function followContentChange() {
    bindInputListeners();
    if (!state.followLatest.value) {
      return;
    }
    options.measure();
    const viewport = options.getViewport();
    if (viewport) {
      options.scrollToBottom(viewport);
      state.markProgrammaticScroll(viewport);
    }
  }

  function reset() {
    state.reset();
    void scrollToBottom();
  }

  function bindInputListeners() {
    inputIntent.bind();
  }

  function stickIfFollowing() {
    bindInputListeners();
    if (state.followLatest.value) {
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
      if (state.followLatest.value) {
        const viewport = options.getViewport();
        if (viewport) {
          options.scrollToBottom(viewport);
          state.markProgrammaticScroll(viewport);
        }
      }
    }
    if (state.followLatest.value) {
      state.initialBottomAligned.value = true;
    }
  }

  function cleanup() {
    inputIntent.unbind();
  }

  onBeforeUnmount(cleanup);

  return {
    bindInputListeners,
    followLatest: state.followLatest,
    followContentChange,
    initialBottomAligned: state.initialBottomAligned,
    isNearBottom: state.isNearBottom,
    reset,
    settleAndStick,
    scrollToBottom,
    stickIfFollowing,
    userDetached: state.userDetached,
  };
}
