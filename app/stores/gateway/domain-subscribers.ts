import type { GatewayStoreContext } from "./types";
import {
  appendAgentDelta,
  appendItemOutputDelta,
  appendPlanDelta,
  appendReasoningSummaryDelta,
  appendReasoningTextDelta,
} from "./thread-history/deltas";
import { updateTurnDiff } from "./thread-history/diff";
import { mergeItemIntoLatestTurn } from "./thread-history/items";
import { resolveServerRequestInHistory } from "./thread-history/requests";
import { mergeThreadTurns, syncCompletedTurn } from "./thread-history/turns";
import { pinnedKey } from "./thread-utils/identity";

export function registerGatewayDomainSubscribers(ctx: GatewayStoreContext) {
  ctx.events.on("thread-status-detected", (event) => {
    ctx.setThreadStatus(event.hostId, event.threadId, event.status, {
      turnId: event.turnId,
    });
  });
  ctx.events.on("thread-settings-detected", (event) => {
    ctx.setThreadSettings(event.hostId, event.threadId, event.settings);
  });
  ctx.events.on("thread-token-usage-detected", (event) => {
    ctx.setThreadTokenUsage(event.hostId, event.threadId, event.tokenUsage);
  });
  ctx.events.on("history-item-upsert", (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      mergeItemIntoLatestTurn(history, currentThread, event.threadId, event.item),
    );
    void ctx.flushPendingSteers(event.hostId, event.threadId);
  });
  ctx.events.on("history-agent-delta", (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      appendAgentDelta(history, currentThread, event.threadId, event.params),
    );
    flushPendingSteers(ctx, event.hostId, event.threadId);
  });
  ctx.events.on("history-plan-delta", (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      appendPlanDelta(history, currentThread, event.threadId, event.params),
    );
    flushPendingSteers(ctx, event.hostId, event.threadId);
  });
  ctx.events.on("history-reasoning-summary-delta", (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      appendReasoningSummaryDelta(history, currentThread, event.threadId, event.params),
    );
    flushPendingSteers(ctx, event.hostId, event.threadId);
  });
  ctx.events.on("history-reasoning-text-delta", (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      appendReasoningTextDelta(history, currentThread, event.threadId, event.params),
    );
    flushPendingSteers(ctx, event.hostId, event.threadId);
  });
  ctx.events.on("history-item-output-delta", (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      appendItemOutputDelta(history, currentThread, event.threadId, event.params, event.itemType),
    );
    flushPendingSteers(ctx, event.hostId, event.threadId);
  });
  ctx.events.on("history-server-request-resolved", (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      resolveServerRequestInHistory(history, currentThread, event.threadId, event.requestId),
    );
  });
  ctx.events.on("history-turn-diff-updated", (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      updateTurnDiff(history, currentThread, event.threadId, event.params),
    );
    flushPendingSteers(ctx, event.hostId, event.threadId);
  });
  ctx.events.on("history-turn-appended", (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      mergeThreadTurns(history, currentThread, event.threadId, [event.turn], "append"),
    );
    void ctx.flushPendingSteers(event.hostId, event.threadId);
  });
  ctx.events.on("history-turn-synced", (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      syncCompletedTurn(history, currentThread, event.threadId, event.turn),
    );
  });
}

function flushPendingSteers(ctx: GatewayStoreContext, hostId: number, threadId: string) {
  void ctx.flushPendingSteers(hostId, threadId);
}

function updateThreadHistory(
  ctx: GatewayStoreContext,
  hostId: number,
  threadId: string,
  update: (history: unknown, currentThread: unknown) => unknown,
) {
  const isSelected = ctx.state.selectedHostId === hostId && ctx.state.selectedThreadId === threadId;
  if (isSelected) {
    ctx.state.history = update(ctx.state.history, ctx.state.currentThread);
    ctx.cacheSelectedThreadSnapshot();
    return;
  }

  const key = pinnedKey(hostId, threadId);
  const snapshot = ctx.state.threadSnapshots[key];
  if (snapshot) {
    ctx.state.threadSnapshots[key] = {
      ...snapshot,
      history: update(snapshot.history, snapshot.currentThread),
    };
  }

  const preview = ctx.state.threadPreviews[key];
  if (preview) {
    ctx.state.threadPreviews = {
      ...ctx.state.threadPreviews,
      [key]: {
        ...preview,
        history: update(preview.history, preview.currentThread),
      },
    };
  }
}
