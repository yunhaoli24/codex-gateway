import { normalizeTokenUsage } from "~~/shared/token-usage";
import { threadIdFromParams } from "../thread-utils/identity";
import { runtimeStatusFromAppThreadStatus } from "../thread-utils/status";
import type { GatewayEventHandlerRegistry } from "./types";

export const threadEventHandlers: GatewayEventHandlerRegistry = {
  "thread/status/changed": (ctx, event, params) => {
    const threadId = threadIdFromParams(params);
    if (threadId) {
      ctx.events.emit("thread-status-detected", {
        hostId: event.hostId,
        threadId: String(threadId),
        status: runtimeStatusFromAppThreadStatus(params.status),
      });
    }
  },
  "thread/settings/updated": (ctx, event, params) => {
    const threadId = threadIdFromParams(params);
    if (threadId) {
      ctx.events.emit("thread-settings-detected", {
        hostId: event.hostId,
        threadId: String(threadId),
        settings: {
          model: params.threadSettings?.model ?? null,
          effort: params.threadSettings?.effort ?? null,
          approvalPolicy: params.threadSettings?.approvalPolicy ?? null,
        },
      });
    }
  },
  "thread/tokenUsage/updated": (ctx, event, params) => {
    const threadId = threadIdFromParams(params);
    const tokenUsage = normalizeTokenUsage(params.tokenUsage);
    if (threadId && tokenUsage) {
      ctx.events.emit("thread-token-usage-detected", {
        hostId: event.hostId,
        threadId: String(threadId),
        tokenUsage,
      });
    }
  },
};
