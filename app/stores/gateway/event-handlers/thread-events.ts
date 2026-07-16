import { normalizeTokenUsage } from "~~/shared/token-usage";
import { gatewayDomainEvents } from "../domain-events";
import { threadIdFromParams } from "../thread-utils/identity";
import { runtimeStatusFromAppThreadStatus } from "../thread-utils/status";
import type { GatewayEventHandlerRegistry } from "./types";

export const threadEventHandlers: GatewayEventHandlerRegistry = {
  "thread/started": (event, params) => {
    if (params.thread?.id) {
      gatewayDomainEvents.emit("thread-summary-detected", {
        hostId: event.hostId,
        thread: params.thread,
      });
    }
  },
  "thread/status/changed": (event, params) => {
    const threadId = threadIdFromParams(params);
    if (threadId) {
      gatewayDomainEvents.emit("thread-status-detected", {
        hostId: event.hostId,
        threadId: String(threadId),
        status: runtimeStatusFromAppThreadStatus(params.status),
      });
    }
  },
  "thread/settings/updated": (event, params) => {
    const threadId = threadIdFromParams(params);
    if (threadId) {
      gatewayDomainEvents.emit("thread-settings-detected", {
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
  "thread/tokenUsage/updated": (event, params) => {
    const threadId = threadIdFromParams(params);
    const tokenUsage = normalizeTokenUsage(params.tokenUsage);
    if (threadId && tokenUsage) {
      gatewayDomainEvents.emit("thread-token-usage-detected", {
        hostId: event.hostId,
        threadId: String(threadId),
        tokenUsage,
      });
    }
  },
};
