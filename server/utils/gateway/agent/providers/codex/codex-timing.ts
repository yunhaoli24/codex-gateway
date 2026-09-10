/**
 * Item lifecycle timestamp extraction.
 *
 * Moves from shared/thread-history/item-lifecycle-timing.ts into the
 * Codex provider directory.  The app-server 0.147 reports the actual
 * lifecycle instant fields (startedAtMs / completedAtMs); the envelope
 * emission time must NOT be used to calculate item durations.
 */
import type { AppServerEventParams } from "./codex-reducer-helpers";

export type ItemLifecyclePhase = "started" | "completed";

export function itemLifecycleTimestampMs(params: AppServerEventParams, phase: ItemLifecyclePhase) {
  const field = phase === "started" ? "startedAtMs" : "completedAtMs";
  const timestamp = params[field];
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    throw new TypeError("Codex app-server " + field + " must be a finite number");
  }
  return timestamp;
}
