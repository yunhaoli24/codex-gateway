import { storeToRefs } from "pinia";

import { computed } from "vue";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { useGatewayTerminalStore } from "@/stores/gateway-terminal";
import { useGatewayBrowserStore } from "@/stores/gateway-browser";
import { useGatewayTmuxStore } from "@/stores/gateway-tmux";
import { pinnedKey, titleForThread } from "@/stores/gateway/thread-utils/identity";
import {
  subAgentWorkspacePanelId,
  terminalWorkspacePanelId,
  browserWorkspacePanelId,
  tmuxWorkspacePanelId,
} from "@/stores/gateway/workspace-panels";
import type { WorkspacePanelSelection } from "./types";

export function useWorkspacePanels(selection: WorkspacePanelSelection) {
  const gateway = useGatewayStore();
  const threadView = useGatewayThreadViewStore();
  const terminalStore = useGatewayTerminalStore();
  const browserStore = useGatewayBrowserStore();
  const tmuxStore = useGatewayTmuxStore();
  const { terminalSessions } = storeToRefs(terminalStore);
  const { threadViews, currentThread } = storeToRefs(threadView);

  const terminalPanels = computed(() =>
    Object.values(terminalSessions.value)
      .filter((session) => {
        if (!session || session.hostId !== selection.selectedHostId.value) return false;
        if (session.scope === "thread")
          return session.threadId === selection.selectedThreadId.value;
        if (session.scope === "project") {
          return (
            !selection.selectedThreadId.value &&
            session.projectId === selection.selectedProjectId.value
          );
        }
        return !selection.selectedThreadId.value && !selection.selectedProjectId.value;
      })
      .map((session) => ({ id: terminalWorkspacePanelId(session.sessionId), session })),
  );

  const subAgentPanels = computed(() =>
    selection.visibleSubAgentPanels.value.map((panel) => {
      const key = pinnedKey(panel.hostId, panel.threadId);
      const thread = threadViews.value[key]?.currentThread as Record<string, any> | null;
      return {
        id: subAgentWorkspacePanelId(key),
        hostId: panel.hostId,
        threadId: panel.threadId,
        title:
          (panel.title !== panel.threadId ? panel.title : null) ||
          (thread ? titleForThread(thread) : null) ||
          panel.threadId,
      };
    }),
  );

  const browserPanels = computed(() =>
    Object.values(browserStore.panels)
      .filter(
        (panel) =>
          panel.hostId === selection.selectedHostId.value &&
          (panel.projectId ?? null) === (selection.selectedProjectId.value ?? null) &&
          (panel.threadId ?? null) === (selection.selectedThreadId.value ?? null),
      )
      .map((panel) => ({ id: browserWorkspacePanelId(panel.panelId), panel })),
  );

  const tmuxPanels = computed(() => {
    const hostId = selection.selectedHostId.value;
    if (!hostId || !tmuxStore.openHostIds.includes(hostId)) return [];
    return [{ id: tmuxWorkspacePanelId(hostId), hostId }];
  });

  const fileWorkspaceRoot = computed(() => {
    const thread = currentThread.value as Record<string, unknown> | null;
    const cwd = typeof thread?.cwd === "string" ? thread.cwd : "";
    return cwd || gateway.selectedProject?.remotePath || "";
  });

  return { terminalPanels, subAgentPanels, browserPanels, tmuxPanels, fileWorkspaceRoot };
}
