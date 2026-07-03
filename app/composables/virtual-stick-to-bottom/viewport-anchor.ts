type ViewportAnchorOptions = {
  getViewport: () => HTMLElement | null;
};

type CapturedAnchor = {
  element: HTMLElement;
  offsetTop: number;
};

export function createViewportAnchor(options: ViewportAnchorOptions) {
  let elements: HTMLElement[] = [];
  let anchor: CapturedAnchor | null = null;

  function setElements(nextElements: Iterable<Element>) {
    elements = Array.from(nextElements).filter(
      (element): element is HTMLElement => element instanceof HTMLElement,
    );
    if (anchor && !anchor.element.isConnected) {
      anchor = null;
    }
  }

  function setElement(element: Element | null) {
    setElements(element ? [element] : []);
  }

  function capture() {
    const viewport = options.getViewport();
    if (!viewport) {
      anchor = null;
      return;
    }
    const viewportRect = viewport.getBoundingClientRect();
    const topEdge = viewportRect.top + 4;
    const bottomEdge = viewportRect.bottom - 4;
    const element = elements.find((candidate) => {
      if (!candidate.isConnected) {
        return false;
      }
      const rect = candidate.getBoundingClientRect();
      return rect.bottom > topEdge && rect.top < bottomEdge;
    });
    anchor = element
      ? {
          element,
          offsetTop: element.getBoundingClientRect().top - viewportRect.top,
        }
      : null;
  }

  function restore() {
    // When the user has intentionally detached from the bottom, new streamed
    // rows can resize content below the viewport. Keep the first visible row at
    // the same screen offset so the message being read does not drift upward.
    const viewport = options.getViewport();
    if (!viewport || !anchor?.element.isConnected) {
      anchor = null;
      return;
    }
    const viewportRect = viewport.getBoundingClientRect();
    const nextOffsetTop = anchor.element.getBoundingClientRect().top - viewportRect.top;
    const delta = nextOffsetTop - anchor.offsetTop;
    if (Math.abs(delta) > 0.5) {
      viewport.scrollTop += delta;
    }
    capture();
  }

  function clear() {
    anchor = null;
  }

  return {
    capture,
    clear,
    restore,
    setElement,
    setElements,
  };
}
