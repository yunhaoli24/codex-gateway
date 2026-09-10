/**
 * Codex-only parameter helpers used by the provider mapper. They stay inside
 * the provider directory so neutral reducers never parse app-server DTOs.
 */
import type { ThreadHistoryItem, ThreadHistoryTurn } from "~~/shared/types";
import {
  threadHistoryItemFromUnknown,
  threadHistoryTurnFromUnknown,
} from "~~/shared/runtime/app-server";

export type AppServerEventParams = Record<string, unknown>;

export function idParam(value: unknown): string | number | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

export function itemParam(params: AppServerEventParams, key = "item"): ThreadHistoryItem | null {
  return threadHistoryItemFromUnknown(params[key]);
}

export function turnParam(params: AppServerEventParams, key = "turn"): ThreadHistoryTurn | null {
  return threadHistoryTurnFromUnknown(params[key]);
}
