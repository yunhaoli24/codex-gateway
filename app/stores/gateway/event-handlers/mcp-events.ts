import { useGatewayMcpRuntimeStore } from "@/stores/gateway-mcp-runtime";
import { recordFromUnknown, stringFromUnknown } from "~~/shared/utils/records";
import type { GatewayEventHandlerRegistry } from "./types";

export const mcpRuntimeEventHandlers: GatewayEventHandlerRegistry = {
  "mcpServer.startupStatus.updated": (event, threadId) => {
    void useGatewayMcpRuntimeStore().refreshStatuses(event.hostId, threadId);
  },
  "mcp.eventStream.notification": (event) => {
    const canonical = event.event;
    if (canonical.type !== "mcp.eventStream.notification") return;
    const subscriptionId = canonical.subscriptionId;
    const notification = recordFromUnknown(canonical.notification);
    const method = stringFromUnknown(notification?.method);
    if (subscriptionId === null || method === null) return;
    useGatewayMcpRuntimeStore().recordEvent({
      subscriptionId,
      method,
      params: notification?.params,
    });
  },
};
