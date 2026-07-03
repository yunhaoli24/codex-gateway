type VirtualMeasurementSchedulerOptions = {
  isFollowing: () => boolean;
  measure: () => void;
  preserveAnchorIfNeeded: () => void;
  stickIfNeeded: () => void;
};

export function createVirtualMeasurementScheduler(options: VirtualMeasurementSchedulerOptions) {
  let resizeObserver: ResizeObserver | null = null;
  let scheduledFrame: number | null = null;
  let scheduledMicrotask = false;

  function cancel() {
    if (scheduledFrame !== null) {
      cancelAnimationFrame(scheduledFrame);
      scheduledFrame = null;
    }
  }

  function schedule() {
    // Markdown highlighting, images, collapsibles, and streamed deltas can all
    // resize after render. Coalesce those changes into one measured frame.
    cancel();
    if (!options.isFollowing()) {
      if (scheduledMicrotask) {
        return;
      }
      scheduledMicrotask = true;
      queueMicrotask(() => {
        scheduledMicrotask = false;
        options.measure();
        options.preserveAnchorIfNeeded();
      });
      return;
    }
    scheduledFrame = requestAnimationFrame(() => {
      scheduledFrame = null;
      options.measure();
      options.stickIfNeeded();
    });
  }

  function observeElements(elements: Iterable<Element>) {
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (typeof ResizeObserver !== "function") {
      return;
    }
    resizeObserver = new ResizeObserver(schedule);
    for (const element of elements) {
      if (element.isConnected) {
        resizeObserver.observe(element);
      }
    }
  }

  function observeElement(element: Element | null) {
    observeElements(element ? [element] : []);
  }

  function cleanup() {
    resizeObserver?.disconnect();
    resizeObserver = null;
    cancel();
  }

  return {
    cancel,
    cleanup,
    observeElement,
    observeElements,
  };
}
