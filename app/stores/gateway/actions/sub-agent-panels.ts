import type { GatewayStoreContext, SubAgentPanelState } from "../types";
import { pinnedKey } from "../thread-utils/identity";

type SubAgentPanelInput = {
  hostId: number;
  threadId: string;
  title?: string | null;
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
      ctx.state.activeSubAgentPanelKey = key;

      try {
        await ctx.openThreadPreview(panel.hostId, panel.threadId);
      } catch {
        // The tab renders the preview-scoped error.
      }
    },

    activateSubAgentPanel(input: { hostId: number; threadId: string }) {
      const key = pinnedKey(input.hostId, input.threadId);
      if (ctx.state.subAgentPanels.some((item) => panelKey(item) === key)) {
        ctx.state.activeSubAgentPanelKey = key;
      }
    },

    closeSubAgentPanel(input?: { hostId?: number; threadId?: string }) {
      const key =
        input?.hostId && input.threadId
          ? pinnedKey(input.hostId, input.threadId)
          : ctx.state.activeSubAgentPanelKey;
      if (!key) {
        return;
      }
      const closingIndex = ctx.state.subAgentPanels.findIndex((item) => panelKey(item) === key);
      if (closingIndex < 0) {
        if (ctx.state.activeSubAgentPanelKey === key) {
          ctx.state.activeSubAgentPanelKey = null;
        }
        return;
      }

      const closing = ctx.state.subAgentPanels[closingIndex];
      const nextPanels = ctx.state.subAgentPanels.filter((item) => panelKey(item) !== key);
      ctx.state.subAgentPanels = nextPanels;
      closeThreadPreview(ctx, closing.hostId, closing.threadId);

      if (ctx.state.activeSubAgentPanelKey !== key) {
        return;
      }
      const nextActive = nextPanels[Math.min(closingIndex, nextPanels.length - 1)] ?? null;
      ctx.state.activeSubAgentPanelKey = nextActive ? panelKey(nextActive) : null;
    },
  };
}

function normalizePanel(input: SubAgentPanelInput): SubAgentPanelState {
  return {
    hostId: input.hostId,
    threadId: input.threadId,
    title: input.title || input.threadId,
  };
}

function panelKey(panel: Pick<SubAgentPanelState, "hostId" | "threadId">) {
  return pinnedKey(panel.hostId, panel.threadId);
}

function closeThreadPreview(ctx: GatewayStoreContext, hostId: number, threadId: string) {
  const key = pinnedKey(hostId, threadId);
  const isSelected = ctx.state.selectedHostId === hostId && ctx.state.selectedThreadId === threadId;
  if (!isSelected) {
    ctx.closeThreadEvents(hostId, threadId);
  }
  const { [key]: _preview, ...threadPreviews } = ctx.state.threadPreviews;
  ctx.state.threadPreviews = threadPreviews;
  if (!isSelected) {
    const { [key]: _snapshot, ...threadSnapshots } = ctx.state.threadSnapshots;
    ctx.state.threadSnapshots = threadSnapshots;
  }
}
