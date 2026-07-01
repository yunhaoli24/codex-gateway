import { appServerTurnErrorFromNotification } from "../errors";
import type { GatewayEventHandlerRegistry } from "./types";

export const errorEventHandlers: GatewayEventHandlerRegistry = {
  error: (ctx, event, params, threadId) => {
    const error = appServerTurnErrorFromNotification(params, ctx.t);
    const turnId = typeof params.turnId === "string" ? params.turnId : String(params.turnId ?? "");
    if (turnId && ctx.maybeQueueServerOverloadedRetry(event.hostId, threadId, turnId, error)) {
      return;
    }
    ctx.setError(error.toDisplayMessage(), {
      hostId: event.hostId,
      threadId,
    });
  },
  "thread/realtime/error": (ctx, event, params, threadId) => {
    ctx.setError(params.message || ctx.t("app.appServerError"), {
      hostId: event.hostId,
      threadId,
    });
  },
};
