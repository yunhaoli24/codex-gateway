export function itemTimestampMs(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function itemStartedAtMs(item: ThreadHistoryItem) {
  return itemTimestampMs(item.startedAtMs);
}

export function itemCompletedAtMs(item: ThreadHistoryItem) {
  return itemTimestampMs(item.completedAtMs);
}

export function formatDurationMs(value: number) {
  const safeValue = Math.max(0, Math.floor(value));
  const totalSeconds = safeValue / 1000;
  const wholeSeconds = Math.floor(totalSeconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  const formattedSeconds = seconds.toFixed(2);
  if (minutes > 0) {
    return `${minutes}m ${formattedSeconds.padStart(5, "0")}s`;
  }
  return `${formattedSeconds}s`;
}
import type { ThreadHistoryItem } from "~~/shared/types";
