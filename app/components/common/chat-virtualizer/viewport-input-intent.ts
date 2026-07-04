type ViewportInputIntentOptions = {
  getViewport: () => HTMLElement | null;
  onKeydown: (event: KeyboardEvent) => void;
  onScroll: (event: Event) => void;
  onTouchMove: (event: TouchEvent) => void;
  onTouchStart: (event: TouchEvent) => void;
  onWheel: (event: WheelEvent) => void;
  onBound?: (viewport: HTMLElement) => void;
};

export function createViewportInputIntent(options: ViewportInputIntentOptions) {
  let boundViewport: HTMLElement | null = null;

  function bind() {
    const viewport = options.getViewport();
    if (!viewport || viewport === boundViewport) {
      return;
    }
    unbind();
    boundViewport = viewport;
    if (!viewport.hasAttribute("tabindex")) {
      viewport.tabIndex = 0;
    }
    options.onBound?.(viewport);
    viewport.addEventListener("scroll", options.onScroll, { passive: true });
    viewport.addEventListener("wheel", options.onWheel, { passive: true });
    viewport.addEventListener("touchstart", options.onTouchStart, { passive: true });
    viewport.addEventListener("touchmove", options.onTouchMove, { passive: true });
    viewport.addEventListener("keydown", options.onKeydown);
  }

  function unbind() {
    if (!boundViewport) {
      return;
    }
    boundViewport.removeEventListener("scroll", options.onScroll);
    boundViewport.removeEventListener("wheel", options.onWheel);
    boundViewport.removeEventListener("touchstart", options.onTouchStart);
    boundViewport.removeEventListener("touchmove", options.onTouchMove);
    boundViewport.removeEventListener("keydown", options.onKeydown);
    boundViewport = null;
  }

  return {
    bind,
    unbind,
  };
}
