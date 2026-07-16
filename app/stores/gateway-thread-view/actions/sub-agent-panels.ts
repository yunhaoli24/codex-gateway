import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { useGatewayWorkspaceLayoutStore } from "@/stores/gateway-workspace-layout";
import { removeThreadView } from "@/stores/gateway/thread-open/thread-view-cache";
import { pinnedKey } from "@/stores/gateway/thread-utils/identity";
import type { SubAgentPanelState } from "@/stores/gateway/types";
import { subAgentWorkspacePanelId } from "@/stores/gateway/workspace-panels";

type SubAgentPanelInput = {
  hostId: number;
  threadId: string;
  title?: string | null;
  parentHostId?: number | null;
  parentThreadId?: string | null;
};

export function createSubAgentPanelActions() {
  return {
    async openSubAgentPanel(input: SubAgentPanelInput) {
      const views = useGatewayThreadViewStore();
      const panel = normalizePanel(input);
      const key = panelKey(panel);
      const existing = views.subAgentPanels.find((item) => panelKey(item) === key);
      views.subAgentPanels = existing
        ? views.subAgentPanels.map((item) =>
            panelKey(item) === key ? { ...item, title: panel.title } : item,
          )
        : [...views.subAgentPanels, panel];
      useGatewayWorkspaceLayoutStore().requestPanelActivation(subAgentWorkspacePanelId(key));
      try {
        await views.openThreadPreview(panel.hostId, panel.threadId);
      } catch {
        // The preview-scoped error is rendered by the subagent panel.
      }
    },

    closeSubAgentPanel(input: { hostId: number; threadId: string }) {
      const navigation = useGatewayNavigationStore();
      const views = useGatewayThreadViewStore();
      const key = pinnedKey(input.hostId, input.threadId);
      const closing = views.subAgentPanels.find((item) => panelKey(item) === key);
      if (!closing) return;
      views.subAgentPanels = views.subAgentPanels.filter((item) => panelKey(item) !== key);
      const isSelected =
        navigation.selectedHostId === closing.hostId &&
        navigation.selectedThreadId === closing.threadId;
      if (!isSelected) {
        useGatewayRealtimeStore().closeThreadEvents(closing.hostId, closing.threadId);
        removeThreadView(closing.hostId, closing.threadId);
      }
    },
  };
}

function normalizePanel(input: SubAgentPanelInput): SubAgentPanelState {
  return {
    hostId: input.hostId,
    threadId: input.threadId,
    title: input.title || input.threadId,
    parentHostId: input.parentHostId ?? input.hostId,
    parentThreadId: input.parentThreadId ?? "",
  };
}

function panelKey(panel: Pick<SubAgentPanelState, "hostId" | "threadId">) {
  return pinnedKey(panel.hostId, panel.threadId);
}
