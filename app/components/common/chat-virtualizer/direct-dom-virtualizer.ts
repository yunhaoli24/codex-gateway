import {
  Virtualizer,
  elementScroll,
  observeElementOffset,
  observeElementRect,
  type PartialKeys,
  type VirtualizerOptions,
} from "@tanstack/virtual-core";
import {
  computed,
  nextTick,
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
  lastPositions: WeakMap<HTMLElement, number>;
  lastSize: number | null;
  mode: DirectDomMode;
  prevRange: { startIndex: number; endIndex: number; isScrolling: boolean } | null;
};

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
    lastPositions: new WeakMap<HTMLElement, number>(),
    lastSize: null,
    mode: directOptions.mode ?? "transform",
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
  const cleanup = instance._didMount();

  watch(
    () => resolvedOptions.value.getScrollElement(),
    (element) => {
      if (element) {
        instance._willUpdate();
      }
    },
    { flush: "sync", immediate: true },
  );

  watch(
    resolvedOptions,
    (nextOptions) => {
      instance.setOptions(wrapOptions(nextOptions));
      instance._willUpdate();
      triggerRef(state);
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
      if (directState.lastPositions.get(element) === next) {
        continue;
      }
      directState.lastPositions.set(element, next);
      if (useTransform) {
        element.style.transform = horizontal
          ? `translate3d(${next}px, 0, 0)`
          : `translate3d(0, ${next}px, 0)`;
      } else {
        element.style[positionAxis] = `${next}px`;
      }
    }
  }

  function containerRef(refValue: Element | ComponentPublicInstance | null) {
    const element = refValue instanceof HTMLElement ? refValue : null;
    directState.container = element;
    directState.lastSize = null;
    if (element) {
      const totalSize = instance.getTotalSize();
      directState.lastSize = totalSize;
      const sizeAxis = instance.options.horizontal ? "width" : "height";
      element.style[sizeAxis] = `${totalSize}px`;
      void nextTick(() => applyDirectStyles());
    }
  }

  function measureElement(element: TItemElement) {
    instance.measureElement(element);
    applyDirectStyles();
  }

  function refresh() {
    instance._willUpdate();
    instance.measure();
    applyDirectStyles();
    triggerRef(state);
  }

  return {
    applyDirectStyles,
    containerRef,
    measureElement,
    refresh,
    virtualizer: state,
  };
}
