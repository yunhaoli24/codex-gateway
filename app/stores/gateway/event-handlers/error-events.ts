import { appServerTurnErrorFromNotification } from "../errors";
import { pinnedKey, titleForThread } from "../thread-utils/identity";
import type { GatewayStoreContext } from "../types";
import type { GatewayEventHandlerRegistry } from "./types";

export const errorEventHandlers: GatewayEventHandlerRegistry = {
  error: (ctx, event, params, threadId) => {
    const error = appServerTurnErrorFromNotification(params, ctx.t);
    const turnId = typeof params.turnId === "string" ? params.turnId : String(params.turnId ?? "");
    if (turnId && ctx.maybeQueueServerOverloadedRetry(event.hostId, threadId, turnId, error)) {
      return;
    }
    ctx.setError(threadScopedErrorMessage(ctx, event.hostId, threadId, error.toDisplayMessage()), {
      hostId: event.hostId,
      threadId,
      turnId: turnId || null,
      transient: error.willRetry,
    });
  },
  "thread/realtime/error": (ctx, event, params, threadId) => {
    ctx.setError(
      threadScopedErrorMessage(
        ctx,
        event.hostId,
        threadId,
        params.message || ctx.t("app.appServerError"),
      ),
      {
        hostId: event.hostId,
        threadId,
      },
    );
  },
};

function threadScopedErrorMessage(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
  message: string,
) {
  return [
    ctx.t("app.threadErrorContext", { title: threadErrorTitle(ctx, hostId, threadId) }),
    message,
  ]
    .filter(Boolean)
    .join("\n");
}

function threadErrorTitle(ctx: GatewayStoreContext, hostId: number, threadId: string) {
  const key = pinnedKey(hostId, threadId);
  const selected =
    ctx.state.selectedHostId === hostId && ctx.state.selectedThreadId === threadId
      ? ctx.state.currentThread
      : null;
  const snapshot = ctx.state.threadSnapshots[key]?.currentThread;
  const preview = ctx.state.threadPreviews[key]?.currentThread;
  const listed = ctx.state.threads.find((thread: any) => String(thread?.id) === threadId);
  const pinned = ctx.state.gatewayConfig.pinnedThreads.find(
    (thread) => thread.hostId === hostId && thread.threadId === threadId,
  );
  return titleForThread(selected || snapshot || preview || listed || pinned || { id: threadId });
}
