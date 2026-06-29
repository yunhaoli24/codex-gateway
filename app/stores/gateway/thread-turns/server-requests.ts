import type { GatewayStoreContext } from "../types";

export async function respondToServerRequest(
  ctx: GatewayStoreContext,
  threadId: string,
  requestId: string | number,
  result: unknown,
) {
  if (!ctx.state.selectedHostId) {
    return;
  }
  await $fetch("/api/server-requests/respond", {
    method: "POST",
    body: {
      hostId: ctx.state.selectedHostId,
      threadId,
      requestId,
      result,
    },
  });
}
