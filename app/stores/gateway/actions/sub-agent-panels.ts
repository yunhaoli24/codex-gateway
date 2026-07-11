import type { GatewayStoreContext, SubAgentPanelState } from "../types";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import { useGatewayWorkspaceLayoutStore } from "@/stores/gateway-workspace-layout";
import { pinnedKey } from "../thread-utils/identity";
import { removeThreadView } from "../thread-open/thread-view-cache";
import { subAgentWorkspacePanelId } from "../workspace-panels";

type SubAgentPanelInput = {
  hostId: number;
  threadId: string;
  title?: string | null;
  parentHostId?: number | null;
  parentThreadId?: string | null;
};

export function createSubAgentPanelActions(ctx: GatewayStoreContext) {
  return {
    async openSubAgentPanel(input: SubAgentPanelInput) {
      const panel = normalizePanel(input);
      const key = panelKey(panel);
      const existing = ctx.state.subAgentPanels.find((item) => panelKey(item) === key);
      ctx.state.subAgentPanels = existing
        ? ctx.state.subAgentPanels.map((item) =>
            panelKey(item) === key ? { ...item, title: panel.title } : item,
          )
        : [...ctx.state.subAgentPanels, panel];
      useGatewayWorkspaceLayoutStore().requestPanelActivation(subAgentWorkspacePanelId(key));

      try {
        await ctx.openThreadPreview(panel.hostId, panel.threadId);
      } catch {
        // The tab renders the preview-scoped error.
      }
    },

    closeSubAgentPanel(input: { hostId: number; threadId: string }) {
      const key = pinnedKey(input.hostId, input.threadId);
      const closingIndex = ctx.state.subAgentPanels.findIndex((item) => panelKey(item) === key);
      if (closingIndex < 0) return;

      const closing = ctx.state.subAgentPanels[closingIndex];
      if (!closing) {
        return;
      }
      const nextPanels = ctx.state.subAgentPanels.filter((item) => panelKey(item) !== key);
      ctx.state.subAgentPanels = nextPanels;
      closeThreadPreview(ctx, closing.hostId, closing.threadId);
    },
  };
}

function normalizePanel(input: SubAgentPanelInput): SubAgentPanelState {
  const parentHostId = input.parentHostId ?? input.hostId;
  const parentThreadId = input.parentThreadId ?? "";
  return {
    hostId: input.hostId,
    threadId: input.threadId,
    title: input.title || input.threadId,
    parentHostId,
    parentThreadId,
  };
}

function panelKey(panel: Pick<SubAgentPanelState, "hostId" | "threadId">) {
  return pinnedKey(panel.hostId, panel.threadId);
}

function closeThreadPreview(ctx: GatewayStoreContext, hostId: number, threadId: string) {
  const isSelected = ctx.state.selectedHostId === hostId && ctx.state.selectedThreadId === threadId;
  if (!isSelected) {
    useGatewayRealtimeStore().closeThreadEvents(hostId, threadId);
    removeThreadView(ctx, hostId, threadId);
  }
}
