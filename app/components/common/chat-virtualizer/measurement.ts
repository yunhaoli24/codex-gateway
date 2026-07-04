import type { VirtualItem } from "@tanstack/vue-virtual";

export function shouldAdjustDetachedResize(
  followLatest: boolean,
  item: VirtualItem,
  getViewport: () => HTMLElement | null,
  getElement: (index: number) => Element | undefined | null,
) {
  if (followLatest) {
    return true;
  }
  const viewport = getViewport();
  const element = getElement(item.index);
  if (!viewport || !(element instanceof HTMLElement)) {
    return false;
  }
  return element.getBoundingClientRect().bottom <= viewport.getBoundingClientRect().top;
}
