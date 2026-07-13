export interface ViewportRowAnchor {
  key: string;
  top: number;
}

export function captureViewportRowAnchor(
  viewport: HTMLElement | null,
  options: { canAnchor?: (element: HTMLElement) => boolean } = {},
) {
  if (!viewport) return null;
  const viewportRect = viewport.getBoundingClientRect();
  const element = Array.from(viewport.querySelectorAll<HTMLElement>("[data-row-key]")).find(
    (candidate) => {
      if (options.canAnchor && !options.canAnchor(candidate)) return false;
      const rect = candidate.getBoundingClientRect();
      return rect.bottom > viewportRect.top + 1 && rect.top < viewportRect.bottom - 1;
    },
  );
  const key = element?.dataset.rowKey;
  return element && key ? { key, top: element.getBoundingClientRect().top } : null;
}

export function findViewportRowByKey(viewport: HTMLElement | null, key: string) {
  return Array.from(viewport?.querySelectorAll<HTMLElement>("[data-row-key]") ?? []).find(
    (candidate) => candidate.dataset.rowKey === key,
  );
}
