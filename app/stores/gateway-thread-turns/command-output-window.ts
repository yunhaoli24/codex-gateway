import type { ThreadHistoryItem } from "~~/shared/types";
import { itemId } from "~~/shared/thread-history/item-identity";
import { commandOutputWindow } from "~~/shared/thread-history/retention";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { useGatewayBootstrapStore } from "@/stores/gateway-bootstrap";
import { patchThreadView } from "@/stores/gateway/thread-open/thread-view-cache";
import {
  messageFromError,
  errorMessageLabels,
  pinnedKey,
} from "@/stores/gateway/thread-utils/identity";
import { captureSessionEpoch } from "@/utils/session-epoch";
import { readTurnTimelinePage } from "./read-turn-page";
import type { Translate } from "./types";

export interface CommandOutputWindowRequest {
  hostId: number;
  threadId: string;
  turnId: string;
  item: ThreadHistoryItem;
  outputEnd?: number;
}

export async function loadCommandOutputWindow(t: Translate, input: CommandOutputWindowRequest) {
  const { hostId, threadId, turnId, item, outputEnd } = input;
  const sessionIsCurrent = captureSessionEpoch();
  try {
    const { items } = await readTurnTimelinePage({
      hostId,
      threadId,
      turnId,
      itemId: itemId(item),
      sessionIsCurrent,
    });
    if (!sessionIsCurrent()) return;
    const body = items.find((candidate) => itemId(candidate) === itemId(item));
    const views = useGatewayThreadViewStore();
    const history = views.threadViews[pinnedKey(hostId, threadId)]?.history;
    if (body === undefined || history == null) return;
    const restored = commandOutputWindow(body, outputEnd);
    patchThreadView(hostId, threadId, {
      history: {
        thread: {
          ...history.thread,
          turns: history.thread.turns.map((turn) =>
            turn.id !== turnId
              ? turn
              : {
                  ...turn,
                  items: turn.items.map((candidate) =>
                    itemId(candidate) === itemId(item) ? restored : candidate,
                  ),
                },
          ),
        },
      },
    });
  } catch (error: unknown) {
    if (sessionIsCurrent())
      useGatewayBootstrapStore().setError(
        messageFromError(error, t("app.loadTurnItemsFailed"), errorMessageLabels(t)),
        { hostId, threadId, turnId },
      );
  }
}
