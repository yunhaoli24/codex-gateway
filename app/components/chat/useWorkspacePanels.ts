import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayTerminalStore } from "@/stores/gateway-terminal";
import { pinnedKey, titleForThread } from "@/stores/gateway/thread-utils/identity";
import {
  subAgentWorkspacePanelId,
  terminalWorkspacePanelId,
} from "@/stores/gateway/workspace-panels";
import type { WorkspacePanelSelection } from "./workspace-dock-types";

export function useWorkspacePanels(selection: WorkspacePanelSelection) {
  const gateway = useGatewayStore();
  const terminalStore = useGatewayTerminalStore();
  const { terminalSessions } = storeToRefs(terminalStore);
  const { threadViews } = storeToRefs(gateway);

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
        title: (thread ? titleForThread(thread) : null) || panel.title || panel.threadId,
      };
    }),
  );

  const fileWorkspaceRoot = computed(() => {
    const thread = gateway.currentThread as Record<string, unknown> | null;
    const cwd = typeof thread?.cwd === "string" ? thread.cwd : "";
    return cwd || gateway.selectedProject?.remotePath || "";
  });

  return { terminalPanels, subAgentPanels, fileWorkspaceRoot };
}
