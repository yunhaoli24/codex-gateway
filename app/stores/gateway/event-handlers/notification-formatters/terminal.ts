import type { GatewayStoreContext } from "../../types";
import { pinnedKey } from "../../thread-utils/identity";
import {
  simpleNotification,
  text,
  truncate,
  type FormattedNotification,
  type NotificationFormatContext,
} from "./common";

export function terminalInteractionNotification(
  ctx: GatewayStoreContext,
  params: Record<string, any>,
  context?: NotificationFormatContext,
): FormattedNotification {
  const stdin = text(params.stdin);
  if (!stdin) {
    return simpleNotification(ctx, "terminalWait", "info", {
      command: commandForTerminalInteraction(ctx, params, context),
      processId: text(params.processId),
    });
  }
  return simpleNotification(ctx, "terminalInteraction", "info", {
    command: commandForTerminalInteraction(ctx, params, context),
    processId: text(params.processId),
    stdin: truncate(stdin, 120),
  });
}

function commandForTerminalInteraction(
  ctx: GatewayStoreContext,
  params: Record<string, any>,
  context?: NotificationFormatContext,
) {
  const processId = text(params.processId);
  const lookupContext = context ?? {
    hostId: ctx.state.selectedHostId ?? 0,
    threadId: text(params.threadId) || ctx.state.selectedThreadId || "",
  };
  const command = findCommandItem(
    ctx,
    lookupContext.hostId,
    lookupContext.threadId,
    text(params.itemId),
    processId,
  )?.command;
  return truncate(
    text(command) || ctx.t("app.notifications.terminalProcessFallback", { processId }),
    140,
  );
}

function findCommandItem(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
  itemId: string,
  processId: string,
) {
  const histories = [
    hostId === ctx.state.selectedHostId && threadId === ctx.state.selectedThreadId
      ? ctx.state.history
      : null,
    ctx.state.threadSnapshots[pinnedKey(hostId, threadId)]?.history,
    ctx.state.threadPreviews[pinnedKey(hostId, threadId)]?.history,
  ];
  for (const history of histories) {
    const item = findCommandItemInHistory(history, itemId, processId);
    if (item) {
      return item;
    }
  }
  return null;
}

function findCommandItemInHistory(history: unknown, itemId: string, processId: string) {
  const turns = (history as any)?.thread?.turns ?? (history as any)?.turns ?? [];
  for (const turn of Array.isArray(turns) ? turns : []) {
    for (const item of Array.isArray(turn?.items) ? turn.items : []) {
      if (
        item?.type === "commandExecution" &&
        ((itemId && String(item.id) === itemId) ||
          (processId && String(item.processId) === processId))
      ) {
        return item;
      }
    }
  }
  return null;
}
