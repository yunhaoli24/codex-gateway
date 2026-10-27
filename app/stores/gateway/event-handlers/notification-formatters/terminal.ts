import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { pinnedKey } from "../../thread-utils/identity";
import type { ThreadHistoryState } from "~~/shared/types";
import { threadTurnsFromHistory } from "~~/shared/thread-history/shape";
import {
  simpleNotification,
  text,
  truncate,
  withDetails,
  type FormattedNotification,
  type NotificationFormatContext,
  type TranslationFunction,
} from "./common";
import { firstNonEmptyString } from "~~/shared/utils/strings";
import { commandDisplayLabel } from "@/utils/thread-item-display";

export function terminalInteractionNotification(
  t: TranslationFunction,
  params: Record<string, unknown>,
  context?: NotificationFormatContext,
): FormattedNotification {
  const stdin = text(params.stdin);
  const command = commandForTerminalInteraction(t, params, context);
  const key = stdin !== "" ? "terminalInteraction" : "terminalWait";
  const values = { command, processId: text(params.processId), stdin };
  // Truncation belongs only to the card summary. Retain the full display command and stdin in
  // the existing lazy disclosure so a long command never becomes impossible to inspect.
  return withDetails(
    simpleNotification(t, key, "info", {
      ...values,
      command: truncate(command, 140),
      stdin: truncate(stdin, 120),
    }),
    t(`app.notifications.${key}.message`, values),
  );
}

function commandForTerminalInteraction(
  t: TranslationFunction,
  params: Record<string, unknown>,
  context?: NotificationFormatContext,
) {
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  const processId = text(params.processId);
  const lookup = context ?? {
    hostId: navigation.selectedHostId ?? 0,
    threadId: firstNonEmptyString([text(params.threadId), navigation.selectedThreadId]) ?? "",
  };
  const histories = [
    lookup.hostId === navigation.selectedHostId && lookup.threadId === navigation.selectedThreadId
      ? views.history
      : null,
    views.threadViews[pinnedKey(lookup.hostId, lookup.threadId)]?.history,
  ];
  let command = "";
  for (const history of histories) {
    command = text(findCommandItemInHistory(history, text(params.itemId), processId)?.command);
    if (command !== "") break;
  }
  return command === ""
    ? t("app.notifications.terminalProcessFallback", { processId })
    : commandDisplayLabel(command);
}

function findCommandItemInHistory(
  history: ThreadHistoryState | null | undefined,
  itemId: string,
  processId: string,
) {
  for (const turn of threadTurnsFromHistory(history ?? null)) {
    for (const item of turn.items ?? []) {
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
