import type { ComposerTurnOptions } from "~~/shared/types";
import { gatewayApi } from "@/utils/gateway-api";
import type { GatewayStoreContext } from "../types";

export function startNewTurn(
  ctx: GatewayStoreContext,
  text: string,
  clientUserMessageId: string,
  options: ComposerTurnOptions,
) {
  return gatewayApi<any>("/api/turns/start", {
    method: "POST",
    body: {
      hostId: ctx.state.selectedHostId,
      threadId: ctx.state.selectedThreadId,
      text,
      clientUserMessageId,
      cwd: ctx.selectedProject?.remotePath,
      model: options.model || undefined,
      effort: options.effort || undefined,
      approvalPolicy: options.approvalPolicy || undefined,
      collaborationMode: options.collaborationMode || undefined,
      images: options.images ?? [],
      files: options.files ?? [],
    },
  });
}

export function steerActiveTurn(
  ctx: GatewayStoreContext,
  text: string,
  clientUserMessageId: string,
  expectedTurnId: string,
  options: ComposerTurnOptions,
) {
  return gatewayApi<any>("/api/turns/steer", {
    method: "POST",
    body: {
      hostId: ctx.state.selectedHostId,
      threadId: ctx.state.selectedThreadId,
      expectedTurnId,
      text,
      clientUserMessageId,
      images: options.images ?? [],
    },
  });
}
