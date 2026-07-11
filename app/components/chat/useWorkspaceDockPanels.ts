import type { DockviewApi, IDockviewPanel } from "dockview-vue";
import type { ComputedRef, Ref } from "vue";
import { useGatewayTerminalTransport } from "@/composables/useGatewayTerminalTransport";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayWorkspaceLayoutStore } from "@/stores/gateway-workspace-layout";
import {
  AGENT_WORKSPACE_PANEL_ID,
  FILES_WORKSPACE_PANEL_ID,
} from "@/stores/gateway/workspace-panels";
import type { WorkspaceDockPanelParams } from "./workspace-dock-types";

interface PanelDefinition {
  id: string;
  title: string;
  component: string;
  params: WorkspaceDockPanelParams;
}

export function useWorkspaceDockPanels(options: {
  selectedThreadId: Ref<string | null>;
  terminalPanels: ComputedRef<Array<{ id: string; session: { sessionId: string; title: string } }>>;
  subAgentPanels: ComputedRef<
    Array<{ id: string; hostId: number; threadId: string; title: string }>
  >;
}) {
  const { t } = useI18n();
  const gateway = useGatewayStore();
  const workspaceLayout = useGatewayWorkspaceLayoutStore();
  const terminalTransport = useGatewayTerminalTransport();

  function definitions(): PanelDefinition[] {
    const panels: PanelDefinition[] = [
      {
        id: AGENT_WORKSPACE_PANEL_ID,
        title: t("app.agentTab"),
        component: "WorkspaceDockAgentPanel",
        params: { kind: "agent" },
      },
    ];
    if (options.selectedThreadId.value) {
      panels.push({
        id: FILES_WORKSPACE_PANEL_ID,
        title: t("app.filesTab"),
        component: "WorkspaceDockFilesPanel",
        params: { kind: "files" },
      });
    }
    panels.push(
      ...options.terminalPanels.value.map(({ id, session }) => ({
        id,
        title: session.title,
        component: "WorkspaceDockTerminalPanel",
        params: { kind: "terminal" as const, sessionId: session.sessionId },
      })),
      ...options.subAgentPanels.value.map(({ id, hostId, threadId, title }) => ({
        id,
        title,
        component: "WorkspaceDockSubAgentPanel",
        params: { kind: "subagent" as const, subAgentHostId: hostId, subAgentThreadId: threadId },
      })),
    );
    return panels;
  }

  function reconcile(api: DockviewApi) {
    const desired = definitions();
    const desiredIds = new Set(desired.map(({ id }) => id));
    for (const panel of api.panels) {
      if (!desiredIds.has(panel.id)) api.removePanel(panel);
    }
    for (const definition of desired) {
      const existing = api.getPanel(definition.id);
      if (existing) {
        existing.api.setTitle(definition.title);
        existing.api.updateParameters(definition.params);
      } else {
        const position = api.activeGroup ? { referenceGroup: api.activeGroup } : undefined;
        api.addPanel({
          ...definition,
          tabComponent: "WorkspaceDockTab",
          renderer: "always",
          inactive: definition.id !== AGENT_WORKSPACE_PANEL_ID,
          position,
        });
      }
    }
  }

  function closeDynamic(panel: IDockviewPanel) {
    const params = panel.params as WorkspaceDockPanelParams;
    const nextPanelId = activateNextPanel(panel);
    if (params.kind === "terminal" && params.sessionId) {
      void terminalTransport.closeTerminal(params.sessionId);
    }
    if (params.kind === "subagent" && params.subAgentHostId && params.subAgentThreadId) {
      gateway.closeSubAgentPanel({
        hostId: params.subAgentHostId,
        threadId: params.subAgentThreadId,
      });
    }
    if (nextPanelId) workspaceLayout.requestPanelActivation(nextPanelId);
  }

  function activateNextPanel(closingPanel: IDockviewPanel) {
    const remainingDynamic = closingPanel.api.group.panels.find((panel) => {
      if (panel.id === closingPanel.id) return false;
      const kind = (panel.params as WorkspaceDockPanelParams).kind;
      return kind === "terminal" || kind === "subagent";
    });
    const nextPanel =
      remainingDynamic ??
      closingPanel.api.group.panels.find((panel) => panel.id === AGENT_WORKSPACE_PANEL_ID);
    nextPanel?.api.setActive();
    return nextPanel?.id ?? null;
  }

  return { reconcile, closeDynamic };
}
