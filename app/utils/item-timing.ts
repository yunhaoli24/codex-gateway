export function itemTimestampMs(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function itemStartedAtMs(item: Record<string, any>) {
  return itemTimestampMs(item.startedAt ?? item.createdAt ?? item.startTime);
}

export function itemCompletedAtMs(item: Record<string, any>) {
  return itemTimestampMs(item.completedAt ?? item.updatedAt ?? item.endTime);
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
