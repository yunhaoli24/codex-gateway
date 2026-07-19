import {
  Virtualizer,
  elementScroll,
  observeElementOffset,
  observeElementRect,
  type PartialKeys,
  type VirtualItem,
  type VirtualizerOptions,
} from "@tanstack/virtual-core";
import {
  computed,
  onScopeDispose,
  shallowRef,
  triggerRef,
  unref,
  watch,
  type ComputedRef,
  type ComponentPublicInstance,
  type Ref,
} from "vue";

type MaybeRef<T> = T | Ref<T> | ComputedRef<T>;
type DirectDomMode = "position" | "transform";

type DirectDomVirtualizerOptions<
  TScrollElement extends Element,
  TItemElement extends Element,
> = PartialKeys<
  VirtualizerOptions<TScrollElement, TItemElement>,
  "observeElementRect" | "observeElementOffset" | "scrollToFn"
>;

type DirectDomState = {
  container: HTMLElement | null;
  edgeKeys: { count: number; first: VirtualItem["key"] | null; last: VirtualItem["key"] | null };
  lastPositions: WeakMap<HTMLElement, number>;
  lastSize: number | null;
  mode: DirectDomMode;
  pendingPrependAnchor: { key: VirtualItem["key"]; top: number } | null;
  prevRange: { startIndex: number; endIndex: number; isScrolling: boolean } | null;
};

// OpenClaw and nanobot preserve prepends with a post-commit DOM anchor. The
// same fallback is needed around virtual-core only for the residual Vue/DOM
// delta, especially when a short non-scrollable list first becomes scrollable.
// It stores one stable key and screen coordinate, never row sizes or a second
// scroll state machine; all dynamic measurement remains owned by virtual-core.
function capturePrependAnchor<TScrollElement extends Element, TItemElement extends Element>(
  instance: Virtualizer<TScrollElement, TItemElement>,
  nextOptions: VirtualizerOptions<TScrollElement, TItemElement>,
  previousEdges: DirectDomState["edgeKeys"],
) {
  const nextCount = nextOptions.count;
  const getNextKey = nextOptions.getItemKey;
  if (
    previousEdges.count === 0 ||
    nextCount <= previousEdges.count ||
    !getNextKey ||
    getNextKey(0) === previousEdges.first ||
    getNextKey(nextCount - 1) !== previousEdges.last
  ) {
    return null;
  }

  const viewport = instance.scrollElement;
  if (!(viewport instanceof HTMLElement)) return null;
  // While following, a scrollable viewport is already covered by virtual-core's end anchor and a
  // DOM correction would apply the prepend delta twice. A detached timeline deliberately switches
  // to anchorTo="start" so core cannot misclassify streaming row growth as an at-end resize; in
  // that mode this keyed DOM anchor owns prepends for both scrollable and underfilled timelines.
  if (nextOptions.anchorTo === "end" && viewport.scrollHeight - viewport.clientHeight > 1)
    return null;
  const viewportRect = viewport.getBoundingClientRect();
  for (const item of instance.getVirtualItems()) {
    const element = instance.elementsCache.get(item.key);
    if (!(element instanceof HTMLElement)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.bottom > viewportRect.top + 1 && rect.top < viewportRect.bottom - 1) {
      return { key: item.key, top: rect.top };
    }
  }
  return null;
}

// Mirrors TanStack React adapter's directDomUpdates path for chat streams.
// Vue's published adapter does not expose that flag yet, so this wraps the
// official virtual-core and lets TanStack own end anchoring/follow behavior.
export function useDirectDomVirtualizer<
  TScrollElement extends Element,
  TItemElement extends Element,
>(
  options: MaybeRef<DirectDomVirtualizerOptions<TScrollElement, TItemElement>>,
  directOptions: { mode?: DirectDomMode } = {},
) {
  const directState: DirectDomState = {
    container: null,
    edgeKeys: { count: 0, first: null, last: null },
    lastPositions: new WeakMap<HTMLElement, number>(),
    lastSize: null,
    mode: directOptions.mode ?? "transform",
    pendingPrependAnchor: null,
    prevRange: null,
  };

  const resolvedOptions = computed(() => ({
    observeElementRect,
    observeElementOffset,
    scrollToFn: elementScroll,
    ...unref(options),
  }));

  const instance = new Virtualizer<TScrollElement, TItemElement>(
    wrapOptions(resolvedOptions.value),
  );
  const state = shallowRef(instance);
  const containerElement = shallowRef<HTMLElement | null>(null);
  const commitVersion = shallowRef(0);
  const cleanup = instance._didMount();

  function scheduleDomCommit() {
    commitVersion.value += 1;
  }

  // A sync watcher can run before Vue has even queued the component patch, so
  // nextTick from that watcher is not a reliable layout-effect equivalent.
  // A post-flush watcher always sees committed keyed rows and still runs before
  // the browser paints the frame.
  watch(
    commitVersion,
    () => {
      applyDirectStyles(instance);
      instance._willUpdate();
      applyDirectStyles(instance);
      restorePendingPrependAnchor();
    },
    { flush: "post" },
  );

  watch(
    () => resolvedOptions.value.getScrollElement(),
    (element) => {
      if (element) scheduleDomCommit();
    },
    { flush: "sync", immediate: true },
  );

  watch(
    resolvedOptions,
    (nextOptions) => {
      const anchor = capturePrependAnchor(instance, nextOptions, directState.edgeKeys);
      // Reactive option updates can coalesce into one commit. Keep a captured
      // prepend transaction until the post-flush watcher consumes it.
      if (anchor) directState.pendingPrependAnchor = anchor;
      instance.setOptions(wrapOptions(nextOptions));
      const count = instance.options.count;
      directState.edgeKeys = {
        count,
        first: count ? instance.options.getItemKey(0) : null,
        last: count ? instance.options.getItemKey(count - 1) : null,
      };
      triggerRef(state);
      scheduleDomCommit();
    },
    { flush: "sync", immediate: true },
  );

  onScopeDispose(cleanup);

  function wrapOptions(
    nextOptions: VirtualizerOptions<TScrollElement, TItemElement>,
  ): VirtualizerOptions<TScrollElement, TItemElement> {
    return {
      ...nextOptions,
      onChange: (changedInstance, sync) => {
        applyDirectStyles(changedInstance);
        if (shouldRerender(changedInstance)) {
          triggerRef(state);
        }
        nextOptions.onChange?.(changedInstance, sync);
      },
    };
  }

  function shouldRerender(changedInstance: Virtualizer<TScrollElement, TItemElement>) {
    const range = changedInstance.range;
    const prev = directState.prevRange;
    const should =
      !prev ||
      prev.isScrolling !== changedInstance.isScrolling ||
      prev.startIndex !== range?.startIndex ||
      prev.endIndex !== range?.endIndex;
    if (should) {
      directState.prevRange = range
        ? {
            startIndex: range.startIndex,
            endIndex: range.endIndex,
            isScrolling: changedInstance.isScrolling,
          }
        : null;
    }
    return should;
  }

  function applyDirectStyles(
    changedInstance: Virtualizer<TScrollElement, TItemElement> = instance,
  ) {
    const container = directState.container;
    if (!container) {
      return;
    }

    const totalSize = changedInstance.getTotalSize();
    if (totalSize !== directState.lastSize) {
      directState.lastSize = totalSize;
      const sizeAxis = changedInstance.options.horizontal ? "width" : "height";
      container.style[sizeAxis] = `${totalSize}px`;
    }

    const horizontal = Boolean(changedInstance.options.horizontal);
    const positionAxis = horizontal ? "left" : "top";
    const scrollMargin = changedInstance.options.scrollMargin;
    const useTransform = directState.mode === "transform";

    for (const item of changedInstance.getVirtualItems()) {
      const element = changedInstance.elementsCache.get(item.key);
      if (!(element instanceof HTMLElement)) {
        continue;
      }
      const next = item.start - scrollMargin;
      if (useTransform) {
        const transform = horizontal
          ? `translate3d(${next}px, 0, 0)`
          : `translate3d(0, ${next}px, 0)`;
        if (
          directState.lastPositions.get(element) === next &&
          element.style.transform === transform
        ) {
          continue;
        }
        directState.lastPositions.set(element, next);
        element.style.transform = transform;
      } else {
        const position = `${next}px`;
        if (
          directState.lastPositions.get(element) === next &&
          element.style[positionAxis] === position
        ) {
          continue;
        }
        directState.lastPositions.set(element, next);
        element.style[positionAxis] = `${next}px`;
      }
    }
  }

  function restorePendingPrependAnchor() {
    const anchor = directState.pendingPrependAnchor;
    directState.pendingPrependAnchor = null;
    const viewport = instance.scrollElement;
    const element = anchor ? instance.elementsCache.get(anchor.key) : null;
    if (!(viewport instanceof HTMLElement) || !(element instanceof HTMLElement) || !anchor) return;

    const delta = element.getBoundingClientRect().top - anchor.top;
    // One correction after Vue's commit is deliberate. Repeated RAF settling
    // would compete with streaming and inner diff/command scroll ownership.
    if (Math.abs(delta) > 1) viewport.scrollTop += delta;
  }

  function containerRef(refValue: Element | ComponentPublicInstance | null) {
    const element = refValue instanceof HTMLElement ? refValue : null;
    // Vue may invoke a function ref again for the same DOM node after every component patch.
    // Treat this as a binding callback, not a render notification: resetting the cache and
    // scheduling a commit for an unchanged node creates a render -> ref -> post-flush watcher ->
    // triggerRef feedback loop. Content and viewport changes are already owned by TanStack and
    // the ResizeObservers in VirtualTimelineViewport, so doing nothing here is intentional.
    if (directState.container === element) return;
    containerElement.value = element;
    directState.container = element;
    directState.lastSize = null;
    if (element) {
      const totalSize = instance.getTotalSize();
      directState.lastSize = totalSize;
      const sizeAxis = instance.options.horizontal ? "width" : "height";
      element.style[sizeAxis] = `${totalSize}px`;
      scheduleDomCommit();
    }
  }

  function measureElement(element: TItemElement) {
    instance.measureElement(element);
    applyDirectStyles();
  }

  function invalidateDirectStyles() {
    directState.lastPositions = new WeakMap<HTMLElement, number>();
    directState.lastSize = null;
  }

  function refresh(options: { forceStyles?: boolean; remeasure?: boolean } = {}) {
    if (options.forceStyles) {
      invalidateDirectStyles();
    }
    instance._willUpdate();
    if (options.remeasure !== false) instance.measure();
    applyDirectStyles();
    triggerRef(state);
  }

  return {
    applyDirectStyles,
    containerElement,
    containerRef,
    measureElement,
    refresh,
    virtualizer: state,
  };
}
