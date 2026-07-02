import { jsonPreview } from "@/utils/thread-items";
import type { GatewayStoreContext } from "../../types";

export interface FormattedNotification {
  title: string;
  message: string;
  details?: string;
  level?: "info" | "warning";
}

export interface NotificationFormatContext {
  hostId: number;
  threadId: string;
}

export type NotificationFormatter = (
  ctx: GatewayStoreContext,
  params: Record<string, any>,
  context?: NotificationFormatContext,
) => FormattedNotification;

export function simpleNotification(
  ctx: GatewayStoreContext,
  key: string,
  level: "info" | "warning" = "info",
  values: Record<string, unknown> = {},
): FormattedNotification {
  return {
    title: ctx.t(`app.notifications.${key}.title`, values),
    message: ctx.t(`app.notifications.${key}.message`, values),
    level,
  };
}

export function withDetails(notification: FormattedNotification, details: unknown) {
  return details ? { ...notification, details: text(details) } : notification;
}

export function verificationSummary(value: unknown) {
  if (!Array.isArray(value) || !value.length) {
    return "";
  }
  return value
    .slice(0, 3)
    .map((item) => text(item?.status || item?.result || item?.model || item?.id || item))
    .filter(Boolean)
    .join(", ");
}

export function itemSummary(item: unknown) {
  if (!item || typeof item !== "object") {
    return text(item);
  }
  const record = item as Record<string, any>;
  return [record.type, record.id].filter(Boolean).join(" · ");
}

export function goalSummary(goal: unknown) {
  if (!goal || typeof goal !== "object") {
    return text(goal);
  }
  const record = goal as Record<string, any>;
  return text(record.summary || record.text || record.title || record.name || goal);
}

export function configRange(range: unknown) {
  if (!range || typeof range !== "object") {
    return "";
  }
  return jsonPreview(range as Record<string, any>);
}

export function list(value: unknown, limit: number) {
  if (!Array.isArray(value)) {
    return text(value);
  }
  const visible = value.slice(0, limit).map(text).filter(Boolean);
  const extra = value.length - visible.length;
  return extra > 0 ? `${visible.join(", ")} +${extra}` : visible.join(", ");
}

export function count(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

export function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function numberText(value: unknown) {
  return typeof value === "number" || typeof value === "bigint" ? String(value) : text(value);
}

export function truncate(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

export function text(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return jsonPreview(value);
}
