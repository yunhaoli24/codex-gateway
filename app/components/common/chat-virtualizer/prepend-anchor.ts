import { nextTick } from "vue";

export interface PrependAnchor {
  key: string;
  index: number;
  top: number;
}

interface CapturePrependAnchorOptions {
  previousKeys: string[] | undefined;
  nextKeys: string[];
  viewport: HTMLElement | null;
}

interface RestorePrependAnchorOptions {
  anchor: PrependAnchor;
  getViewport: () => HTMLElement | null;
  refresh: () => void;
  measureVisibleItems: () => void;
  scrollToIndex: (index: number) => void;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

export function capturePrependAnchor(options: CapturePrependAnchorOptions) {
  const { previousKeys, nextKeys, viewport } = options;
  if (!previousKeys?.length || !viewport) {
    return null;
  }

  const anchorElement = firstVisibleStableRow(viewport);
  const key = anchorElement?.dataset.rowKey;
  if (!anchorElement || !key) {
    return null;
  }

  const previousIndex = previousKeys.indexOf(key);
  const nextIndex = nextKeys.indexOf(key);
  if (previousIndex < 0 || nextIndex <= previousIndex) {
    return null;
  }
  return {
    key,
    index: nextIndex,
    top: anchorElement.getBoundingClientRect().top,
  };
}

export async function restorePrependAnchor(options: RestorePrependAnchorOptions) {
  await nextTick();
  options.refresh();
  options.scrollToIndex(options.anchor.index);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await nextFrame();
    options.measureVisibleItems();

    const viewport = options.getViewport();
    const anchorElement = findRowByKey(viewport, options.anchor.key);
    if (!viewport || !anchorElement) {
      return;
    }

    const delta = anchorElement.getBoundingClientRect().top - options.anchor.top;
    if (Math.abs(delta) <= 1) {
      break;
    }
    viewport.scrollTop += delta;
    options.refresh();
  }
}

function firstVisibleStableRow(viewport: HTMLElement) {
  const viewportRect = viewport.getBoundingClientRect();
  return Array.from(viewport.querySelectorAll<HTMLElement>("[data-row-key]")).find((element) => {
    const key = element.dataset.rowKey;
    if (!key || key === "older-turns") {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.bottom > viewportRect.top + 1 && rect.top < viewportRect.bottom - 1;
  });
}

function findRowByKey(viewport: HTMLElement | null, key: string) {
  return Array.from(viewport?.querySelectorAll<HTMLElement>("[data-row-key]") ?? []).find(
    (candidate) => candidate.dataset.rowKey === key,
  );
}
