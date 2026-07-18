import {
  appendAgentDelta,
  appendCommandOutputDelta,
  appendPlanDelta,
  appendReasoningSummaryDelta,
  appendReasoningTextDelta,
} from "~~/shared/thread-history/deltas";
import { updateTurnDiff } from "~~/shared/thread-history/diff";
import { mergeItemIntoLatestTurn } from "~~/shared/thread-history/items";
import { resolveServerRequestInHistory } from "~~/shared/thread-history/requests";
import { mergeThreadTurns, syncCompletedTurn } from "~~/shared/thread-history/turns";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayComposerStore } from "@/stores/gateway-composer";
import { useGatewayFileWorkspaceStore } from "@/stores/file-workspace";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadActivityStore } from "@/stores/gateway-thread-activity";
import { useGatewayThreadRuntimeStore } from "@/stores/gateway-thread-runtime";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { gatewayDomainEvents } from "./domain-events";
import { pinnedKey } from "./thread-utils/identity";
import { patchThreadView } from "./thread-open/thread-view-cache";
import {
  rememberActiveTerminalProcess,
  clearActiveTerminalProcess,
} from "./thread-turns/terminal-processes";

export function registerGatewayDomainSubscribers() {
  gatewayDomainEvents.on("thread-summary-detected", (event) => {
    useGatewayThreadActivityStore().upsertThread(
      event.hostId,
      event.thread,
      useGatewayStore().projects,
    );
  });
  gatewayDomainEvents.on("remote-files-changed", (event) => {
    useGatewayFileWorkspaceStore().markRemoteFilesChanged(
      event.hostId,
      event.threadId,
      event.paths,
    );
  });
  gatewayDomainEvents.on("thread-status-detected", (event) => {
    useGatewayThreadRuntimeStore().setThreadStatus(event.hostId, event.threadId, event.status, {
      turnId: event.turnId,
    });
  });
  gatewayDomainEvents.on("terminal-process-detected", rememberActiveTerminalProcess);
  gatewayDomainEvents.on("terminal-process-completed", clearActiveTerminalProcess);
  gatewayDomainEvents.on("thread-settings-detected", (event) => {
    useGatewayComposerStore().setThreadSettings(event.hostId, event.threadId, event.settings);
  });
  gatewayDomainEvents.on("thread-token-usage-detected", (event) => {
    useGatewayThreadRuntimeStore().setThreadTokenUsage(
      event.hostId,
      event.threadId,
      event.tokenUsage,
    );
  });
  gatewayDomainEvents.on("history-item-upsert", (event) => {
    updateThreadHistory(event.hostId, event.threadId, (history, currentThread) =>
      mergeItemIntoLatestTurn(history, currentThread, event.threadId, event.item),
    );
  });
  gatewayDomainEvents.on("history-agent-delta", (event) => {
    updateThreadHistory(event.hostId, event.threadId, (history, currentThread) =>
      appendAgentDelta(history, currentThread, event.threadId, event.params),
    );
  });
  gatewayDomainEvents.on("history-plan-delta", (event) => {
    updateThreadHistory(event.hostId, event.threadId, (history, currentThread) =>
      appendPlanDelta(history, currentThread, event.threadId, event.params),
    );
  });
  gatewayDomainEvents.on("history-reasoning-summary-delta", (event) => {
    updateThreadHistory(event.hostId, event.threadId, (history, currentThread) =>
      appendReasoningSummaryDelta(history, currentThread, event.threadId, event.params),
    );
  });
  gatewayDomainEvents.on("history-reasoning-text-delta", (event) => {
    updateThreadHistory(event.hostId, event.threadId, (history, currentThread) =>
      appendReasoningTextDelta(history, currentThread, event.threadId, event.params),
    );
  });
  gatewayDomainEvents.on("history-command-output-delta", (event) => {
    updateThreadHistory(event.hostId, event.threadId, (history, currentThread) =>
      appendCommandOutputDelta(history, currentThread, event.threadId, event.params),
    );
  });
  gatewayDomainEvents.on("history-server-request-resolved", (event) => {
    updateThreadHistory(event.hostId, event.threadId, (history, currentThread) =>
      resolveServerRequestInHistory(history, currentThread, event.threadId, event.requestId),
    );
  });
  gatewayDomainEvents.on("history-turn-diff-updated", (event) => {
    updateThreadHistory(event.hostId, event.threadId, (history, currentThread) =>
      updateTurnDiff(history, currentThread, event.threadId, event.params),
    );
  });
  gatewayDomainEvents.on("history-turn-appended", (event) => {
    updateThreadHistory(event.hostId, event.threadId, (history, currentThread) =>
      mergeThreadTurns(history, currentThread, event.threadId, [event.turn], "append"),
    );
  });
  gatewayDomainEvents.on("history-turn-synced", (event) => {
    updateThreadHistory(event.hostId, event.threadId, (history, currentThread) =>
      syncCompletedTurn(history, currentThread, event.threadId, event.turn),
    );
  });
}

function updateThreadHistory(
  hostId: number,
  threadId: string,
  update: (history: unknown, currentThread: unknown) => unknown,
) {
  const navigation = useGatewayNavigationStore();
  const views = useGatewayThreadViewStore();
  if (navigation.selectedHostId === hostId && navigation.selectedThreadId === threadId) {
    views.history = update(views.history, views.currentThread);
    views.cacheSelectedThreadView();
    return;
  }
  const view = views.threadViews[pinnedKey(hostId, threadId)];
  if (view) {
    patchThreadView(hostId, threadId, {
      history: update(view.history, view.currentThread),
    });
  }
}
