import type { GatewayStoreContext } from "./types";
import {
  appendAgentDelta,
  appendItemOutputDelta,
  appendPlanDelta,
  appendReasoningSummaryDelta,
  appendReasoningTextDelta,
} from "~~/shared/thread-history/deltas";
import { updateTurnDiff } from "~~/shared/thread-history/diff";
import { mergeItemIntoLatestTurn } from "~~/shared/thread-history/items";
import { resolveServerRequestInHistory } from "~~/shared/thread-history/requests";
import { mergeThreadTurns, syncCompletedTurn } from "~~/shared/thread-history/turns";
import { pinnedKey } from "./thread-utils/identity";
import { patchThreadView } from "./thread-open/thread-view-cache";
import {
  rememberActiveTerminalProcess,
  clearActiveTerminalProcess,
} from "./thread-turns/terminal-processes";
import { useGatewayFileWorkspaceStore } from "@/stores/gateway-file-workspace";

export function registerGatewayDomainSubscribers(ctx: GatewayStoreContext) {
  ctx.events.on("remote-files-changed", (event) => {
    useGatewayFileWorkspaceStore().markRemoteFilesChanged(
      event.hostId,
      event.threadId,
      event.paths,
    );
  });
  ctx.events.on("thread-status-detected", (event) => {
    ctx.setThreadStatus(event.hostId, event.threadId, event.status, {
      turnId: event.turnId,
    });
  });
  ctx.events.on("terminal-process-detected", (event) => {
    rememberActiveTerminalProcess(ctx, event);
  });
  ctx.events.on("terminal-process-completed", (event) => {
    clearActiveTerminalProcess(ctx, event);
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
  });
  ctx.events.on("history-agent-delta", (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      appendAgentDelta(history, currentThread, event.threadId, event.params),
    );
  });
  ctx.events.on("history-plan-delta", (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      appendPlanDelta(history, currentThread, event.threadId, event.params),
    );
  });
  ctx.events.on("history-reasoning-summary-delta", (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      appendReasoningSummaryDelta(history, currentThread, event.threadId, event.params),
    );
  });
  ctx.events.on("history-reasoning-text-delta", (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      appendReasoningTextDelta(history, currentThread, event.threadId, event.params),
    );
  });
  ctx.events.on("history-item-output-delta", (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      appendItemOutputDelta(history, currentThread, event.threadId, event.params, event.itemType),
    );
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
  });
  ctx.events.on("history-turn-appended", (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      mergeThreadTurns(history, currentThread, event.threadId, [event.turn], "append"),
    );
  });
  ctx.events.on("history-turn-synced", (event) => {
    updateThreadHistory(ctx, event.hostId, event.threadId, (history, currentThread) =>
      syncCompletedTurn(history, currentThread, event.threadId, event.turn),
    );
  });
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
    ctx.cacheSelectedThreadView();
    return;
  }

  const key = pinnedKey(hostId, threadId);
  const view = ctx.state.threadViews[key];
  if (view) {
    patchThreadView(ctx, hostId, threadId, {
      history: update(view.history, view.currentThread),
    });
  }
}
