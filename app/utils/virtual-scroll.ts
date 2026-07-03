import type { VirtualItem, Virtualizer } from "@tanstack/vue-virtual";

export function shouldAdjustVirtualScrollForResize(
  followLatest: boolean,
  _item: VirtualItem,
  _instance: Virtualizer<Element, Element>,
) {
  return followLatest;
}
