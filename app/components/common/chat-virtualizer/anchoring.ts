import { elementScroll, type VirtualizerOptions } from "@tanstack/virtual-core";

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
  // Keep end anchoring enabled even while the reader is detached: TanStack uses
  // it to preserve stable message keys across history prepends. Detachment is
  // expressed by disabling append following and at-end resize compensation,
  // not by blocking scrollToFn, which would also block prepend corrections.
  // While detached, disable core's "was at end" resize compensation entirely.
  // During dynamic remeasurement, virtual distance can temporarily be <= 0,
  // so use negative infinity rather than a small negative threshold.
  const scrollEndThreshold = options.followLatest
    ? options.scrollEndThreshold
    : Number.NEGATIVE_INFINITY;
  return {
    // Chat history always uses end anchoring so keyed prepends remain stable.
    // Detaching only disables append following and at-end resize compensation.
    anchorTo: "end",
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
