import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { pinnedKey } from "../../thread-utils/identity";
import {
  simpleNotification,
  text,
  truncate,
  type FormattedNotification,
  type NotificationFormatContext,
  type TranslationFunction,
} from "./common";

export function terminalInteractionNotification(
  t: TranslationFunction,
  params: Record<string, any>,
  context?: NotificationFormatContext,
): FormattedNotification {
  const stdin = text(params.stdin);
  const command = commandForTerminalInteraction(t, params, context);
  return stdin
    ? simpleNotification(t, "terminalInteraction", "info", {
        command,
        processId: text(params.processId),
        stdin: truncate(stdin, 120),
      })
    : simpleNotification(t, "terminalWait", "info", {
        command,
        processId: text(params.processId),
      });
}

function commandForTerminalInteraction(
  t: TranslationFunction,
  params: Record<string, any>,
  context?: NotificationFormatContext,
) {
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  const processId = text(params.processId);
  const lookup = context ?? {
    hostId: navigation.selectedHostId ?? 0,
    threadId: text(params.threadId) || navigation.selectedThreadId || "",
  };
  const histories = [
    lookup.hostId === navigation.selectedHostId && lookup.threadId === navigation.selectedThreadId
      ? views.history
      : null,
    views.threadViews[pinnedKey(lookup.hostId, lookup.threadId)]?.history,
  ];
  let command: unknown;
  for (const history of histories) {
    command = findCommandItemInHistory(history, text(params.itemId), processId)?.command;
    if (command) break;
  }
  return truncate(
    text(command) || t("app.notifications.terminalProcessFallback", { processId }),
    140,
  );
}

function findCommandItemInHistory(history: unknown, itemId: string, processId: string) {
  const turns = (history as any)?.thread?.turns ?? (history as any)?.turns ?? [];
  for (const turn of Array.isArray(turns) ? turns : []) {
    for (const item of Array.isArray(turn?.items) ? turn.items : []) {
      if (
        item?.type === "commandExecution" &&
        ((itemId && String(item.id) === itemId) ||
          (processId && String(item.processId) === processId))
      )
        return item;
    }
  }
  return null;
}
