import type { ThreadHistoryItem, ThreadHistoryTurn } from "../types";
import type { AppServerEventParams } from "./types";

export function idParam(value: unknown): string | number | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

export function recordParam(params: AppServerEventParams, key: string) {
  const value = params[key];
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function itemParam(params: AppServerEventParams, key = "item"): ThreadHistoryItem | null {
  return recordParam(params, key) as ThreadHistoryItem | null;
}

export function turnParam(params: AppServerEventParams, key = "turn"): ThreadHistoryTurn | null {
  return recordParam(params, key) as ThreadHistoryTurn | null;
}
