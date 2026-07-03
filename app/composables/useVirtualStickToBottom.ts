import { nextTick, onBeforeUnmount } from "vue";
import { createStickToBottomState, type ThresholdSource } from "./virtual-stick-to-bottom/state";
import { createViewportInputIntent } from "./virtual-stick-to-bottom/viewport-input-intent";
import { createVirtualMeasurementScheduler } from "./virtual-stick-to-bottom/measurement-scheduler";
import { createViewportAnchor } from "./virtual-stick-to-bottom/viewport-anchor";

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
  const viewportAnchor = createViewportAnchor({
    getViewport: options.getViewport,
  });
  const state = createStickToBottomState({
    threshold: options.threshold,
    getViewport: options.getViewport,
    onDetached: () => {
      scheduler.cancel();
      viewportAnchor.capture();
    },
    onLocked: () => viewportAnchor.clear(),
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
  const scheduler = createVirtualMeasurementScheduler({
    measure: options.measure,
    preserveAnchorIfNeeded: () => {
      if (!state.followLatest.value) {
        viewportAnchor.restore();
      }
    },
    stickIfNeeded: () => {
      if (state.followLatest.value) {
        void scrollToBottom();
      }
    },
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

  function reset() {
    state.reset();
    void scrollToBottom();
  }

  function bindInputListeners() {
    inputIntent.bind();
  }

  function observeElements(elements: Iterable<Element>) {
    viewportAnchor.setElements(elements);
    scheduler.observeElements(elements);
  }

  function observeElement(element: Element | null) {
    viewportAnchor.setElement(element);
    scheduler.observeElement(element);
  }

  function stickIfFollowing() {
    bindInputListeners();
    options.measure();
    if (state.followLatest.value) {
      void scrollToBottom();
    } else {
      viewportAnchor.restore();
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
      } else {
        viewportAnchor.restore();
      }
    }
    if (state.followLatest.value) {
      state.initialBottomAligned.value = true;
    }
  }

  function cleanup() {
    inputIntent.unbind();
    scheduler.cleanup();
  }

  onBeforeUnmount(cleanup);

  return {
    bindInputListeners,
    followLatest: state.followLatest,
    initialBottomAligned: state.initialBottomAligned,
    isNearBottom: state.isNearBottom,
    observeElement,
    observeElements,
    reset,
    settleAndStick,
    scrollToBottom,
    stickIfFollowing,
  };
}
