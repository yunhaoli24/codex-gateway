import type { GatewayEvent } from "~~/shared/types";

/** History already owns item bodies. Keep only lifecycle/diagnostic events in this tail, otherwise
 * a second copy of item/completed or turn/diff/updated would defeat collapsed-history release.
 * All events still reach the reducer; this filter applies only to the optional diagnostic cache. */
export function retainThreadEvents(events: GatewayEvent[]) {
  return events
    .filter(
      ({ event }) => !event.type.startsWith("timeline.item.") && event.type !== "turn.diff.updated",
    )
    .slice(-500);
}
