import type { InjectionKey } from "vue";
import { inject, provide } from "vue";

type TimelineViewportGetter = () => HTMLElement | null;

const timelineViewportKey: InjectionKey<TimelineViewportGetter> = Symbol("timeline-viewport");

export function provideTimelineViewport(getViewport: TimelineViewportGetter) {
  provide(timelineViewportKey, getViewport);
}

export function useTimelineViewport() {
  return inject(timelineViewportKey, () => null);
}
