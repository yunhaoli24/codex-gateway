import type { GatewayStoreContext } from "../types";
import { gatewayApi } from "@/utils/gateway-api";

export async function respondToServerRequest(
  ctx: GatewayStoreContext,
  threadId: string,
  requestId: string | number,
  result: unknown,
) {
  if (!ctx.state.selectedHostId) {
    return;
  }
  await gatewayApi("/api/server-requests/respond", {
    method: "POST",
    body: {
      hostId: ctx.state.selectedHostId,
      threadId,
      requestId,
      result,
    },
  });
}
