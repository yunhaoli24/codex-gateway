/**
 * Item lifecycle timestamp extraction.
 *
 * Lifecycle notifications have a required phase timestamp; 0.166 also embeds lifecycle
 * timestamps in their item payloads and history. Preserve those official names downstream.
 * Envelope emission time measures delivery, not the item's start/completion instant.
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
