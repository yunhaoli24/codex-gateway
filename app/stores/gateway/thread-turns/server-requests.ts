import type { GatewayStoreContext } from "../types";
import { gatewayApi } from "@/utils/gateway-api";

export async function respondToServerRequest(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
  requestId: string | number,
  result: unknown,
) {
  await gatewayApi("/api/server-requests/respond", {
    method: "POST",
    body: {
      hostId,
      threadId,
      requestId,
      result,
    },
  });
}
