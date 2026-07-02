import type { GatewayStoreContext } from "../types";
import { sendRealtimeRequest } from "../realtime/request-response";

export async function respondToServerRequest(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
  requestId: string | number,
  result: unknown,
) {
  await sendRealtimeRequest(ctx, (realtimeRequestId) => ({
    type: "serverRequest.respond",
    requestId: realtimeRequestId,
    hostId,
    threadId,
    serverRequestId: requestId,
    result,
  }));
}
