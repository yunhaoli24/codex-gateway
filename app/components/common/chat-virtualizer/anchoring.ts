import {
  elementScroll,
  type VirtualItem,
  type Virtualizer,
  type VirtualizerOptions,
} from "@tanstack/virtual-core";

type ChatVirtualizerBehavior = Pick<
  VirtualizerOptions<HTMLElement, Element>,
  "anchorTo" | "followOnAppend" | "initialOffset" | "scrollEndThreshold" | "scrollToFn"
>;

export function createChatVirtualizerBehavior(options: {
  followLatest: boolean;
  scrollEndThreshold: number;
}): ChatVirtualizerBehavior {
  // This config owns only the outer, unbounded Agent timeline. Diff and command
  // output use independent max-height viewports; their input events stay inside
  // those components and must never toggle or drive this outer scroll instance.
  //
  // End anchoring is only valid while following. During dynamic measurement TanStack can report
  // an end-distance sentinel that still satisfies even a negative-infinity threshold; leaving
  // anchorTo="end" would then run the core's wasAtEnd resize branch before our custom predicate
  // and pull a detached reader downward. Detached history prepends are preserved by the keyed DOM
  // anchor in direct-dom-virtualizer instead, so using start anchoring here is intentional.
  const scrollEndThreshold = options.followLatest
    ? options.scrollEndThreshold
    : Number.NEGATIVE_INFINITY;
  return {
    anchorTo: options.followLatest ? "end" : "start",
    followOnAppend: options.followLatest,
    initialOffset: () => 1_000_000_000,
    scrollEndThreshold,
    scrollToFn: (
      offset: number,
      scrollOptions: Parameters<VirtualizerOptions<HTMLElement, Element>["scrollToFn"]>[1],
      instance: Parameters<VirtualizerOptions<HTMLElement, Element>["scrollToFn"]>[2],
    ) => {
      elementScroll(offset, scrollOptions, instance);
    },
  };
}

export function shouldAdjustChatScrollForSizeChange(
  _item: VirtualItem,
  _instance: Virtualizer<HTMLElement, Element>,
  followLatest: boolean,
) {
  // Do not add a positional fallback here. A turn can contain Agent text followed by command and
  // diff blocks, so streamed text may resize a row that is geometrically above the viewport even
  // though the user expects the raw viewport to stay parked. Once detached, all row-resize
  // compensation is disabled. Keyed history prepends use anchorTo="end", while panel restoration
  // uses the explicit DOM anchor in reflow(); neither path depends on this resize hook.
  return followLatest;
}
