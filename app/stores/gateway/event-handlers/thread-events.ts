import { normalizeTokenUsage } from "~~/shared/token-usage";
import {
  appServerThreadFromUnknown,
  threadSettingsFromAppServer,
} from "~~/shared/runtime/app-server";
import { gatewayDomainEvents } from "../domain-events";
import { runtimeStatusFromAppThreadStatus } from "../thread-utils/status";
import type { GatewayEventHandlerRegistry } from "./types";

export const threadEventHandlers: GatewayEventHandlerRegistry = {
  "thread.started": (event) => {
    const canonical = event.event;
    if (canonical.type !== "thread.started") return;
    const thread = appServerThreadFromUnknown(canonical.thread);
    if (thread !== null) {
      gatewayDomainEvents.emit("thread-summary-detected", {
        hostId: event.hostId,
        thread,
      });
    }
  },
  "thread.status.changed": (event, threadId) => {
    const canonical = event.event;
    if (canonical.type !== "thread.status.changed") return;
    gatewayDomainEvents.emit("thread-status-detected", {
      hostId: event.hostId,
      threadId,
      status: runtimeStatusFromAppThreadStatus(canonical.status),
    });
  },
  "thread.settings.updated": (event, threadId) => {
    const canonical = event.event;
    if (canonical.type !== "thread.settings.updated") return;
    const settings = threadSettingsFromAppServer(canonical.threadSettings);
    if (settings !== null) {
      gatewayDomainEvents.emit("thread-settings-detected", {
        hostId: event.hostId,
        threadId,
        settings,
      });
    }
  },
  "thread.usage.updated": (event, threadId) => {
    const canonical = event.event;
    if (canonical.type !== "thread.usage.updated") return;
    const tokenUsage = normalizeTokenUsage(canonical.tokenUsage);
    if (tokenUsage !== null) {
      gatewayDomainEvents.emit("thread-token-usage-detected", {
        hostId: event.hostId,
        threadId,
        tokenUsage,
      });
    }
  },
};
