import type { ThreadHistoryItem } from "~~/shared/types";
import { itemId } from "~~/shared/thread-history/item-identity";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { useGatewayBootstrapStore } from "@/stores/gateway-bootstrap";
import { patchThreadView } from "@/stores/gateway/thread-open/thread-view-cache";
import {
  messageFromError,
  errorMessageLabels,
  pinnedKey,
} from "@/stores/gateway/thread-utils/identity";
import { captureSessionEpoch } from "@/utils/session-epoch";
import { requestThreadItems } from "./transport";
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
    const { data } = await requestThreadItems({
      hostId,
      threadId,
      turnId,
      itemIds: [itemId(item)],
      outputEnd,
    });
    if (!sessionIsCurrent()) return;
    const entry = data.find((candidate) => itemId(candidate.item) === itemId(item));
    const views = useGatewayThreadViewStore();
    const history = views.threadViews[pinnedKey(hostId, threadId)]?.history;
    if (entry === undefined || history == null) return;
    // Persisted commands can be Codex's own shorter head/tail summary. Replace the live item,
    // including its window metadata, rather than carrying offsets from a different output string.
    const restored = {
      ...entry.item,
      turnId: entry.turnId,
      startedAtMs: entry.startedAtMs,
      completedAtMs: entry.completedAtMs,
    };
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
