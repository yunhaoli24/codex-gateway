import type { VirtualItem, Virtualizer } from "@tanstack/vue-virtual";

export function shouldAdjustVirtualScrollForResize(
  followLatest: boolean,
  item: VirtualItem,
  instance: Virtualizer<Element, Element>,
) {
  if (followLatest) {
    return true;
  }
  return item.end <= (instance.scrollOffset ?? 0);
}
