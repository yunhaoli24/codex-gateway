import { elementScroll, type VirtualizerOptions } from "@tanstack/virtual-core";

type ChatVirtualizerBehavior = Pick<
  VirtualizerOptions<HTMLElement, Element>,
  "anchorTo" | "followOnAppend" | "initialOffset" | "scrollEndThreshold" | "scrollToFn"
>;

export function createChatVirtualizerBehavior(options: {
  followLatest: boolean;
  scrollEndThreshold: number;
}): ChatVirtualizerBehavior {
  // While detached, disable core's "was at end" resize compensation entirely.
  // During dynamic remeasurement, virtual distance can temporarily be <= 0,
  // so use negative infinity rather than a small negative threshold.
  const scrollEndThreshold = options.followLatest
    ? options.scrollEndThreshold
    : Number.NEGATIVE_INFINITY;
  return {
    anchorTo: (options.followLatest ? "end" : "start") as "end" | "start",
    followOnAppend: options.followLatest,
    initialOffset: () => 1_000_000_000,
    scrollEndThreshold,
    scrollToFn: (
      offset: number,
      scrollOptions: Parameters<VirtualizerOptions<HTMLElement, Element>["scrollToFn"]>[1],
      instance: Parameters<VirtualizerOptions<HTMLElement, Element>["scrollToFn"]>[2],
    ) => {
      if (options.followLatest) {
        elementScroll(offset, scrollOptions, instance);
      }
    },
  };
}
