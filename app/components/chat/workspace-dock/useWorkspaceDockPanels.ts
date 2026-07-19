import { Orientation } from "dockview-vue";
import type { DockviewApi, IDockviewPanel, SerializedDockview } from "dockview-vue";

import type { ComputedRef, Ref } from "vue";
import { useGatewayTerminalTransport } from "@/composables/terminal/useGatewayTerminalTransport";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { useGatewayWorkspaceLayoutStore } from "@/stores/gateway-workspace-layout";
import { useGatewayBrowserStore } from "@/stores/gateway-browser";
import { useGatewayTmuxStore } from "@/stores/gateway-tmux";
import { closeBrowserPreview } from "@/stores/gateway-browser/transport";
import {
  AGENT_WORKSPACE_PANEL_ID,
  FILES_WORKSPACE_PANEL_ID,
} from "@/stores/gateway/workspace-panels";
import type { WorkspaceDockPanelParams } from "./types";
import { workspacePanelPolicy } from "./panel-registry";

interface PanelDefinition {
  id: string;
  title: string;
  component: string;
  params: WorkspaceDockPanelParams;
}

const DEFAULT_GROUP_ID = "workspace-default-group";

export function useWorkspaceDockPanels(options: {
  selectedThreadId: Ref<string | null>;
  terminalPanels: ComputedRef<Array<{ id: string; session: { sessionId: string; title: string } }>>;
  subAgentPanels: ComputedRef<
    Array<{ id: string; hostId: number; threadId: string; title: string }>
  >;
  browserPanels: ComputedRef<Array<{ id: string; panel: { panelId: string; title: string } }>>;
  tmuxPanels: ComputedRef<Array<{ id: string }>>;
}) {
  const { t } = useI18n();
  const threadView = useGatewayThreadViewStore();
  const workspaceLayout = useGatewayWorkspaceLayoutStore();
  const terminalTransport = useGatewayTerminalTransport();
  const browserStore = useGatewayBrowserStore();
  const tmuxStore = useGatewayTmuxStore();

  function definitions(): PanelDefinition[] {
    const panels: PanelDefinition[] = [
      {
        id: AGENT_WORKSPACE_PANEL_ID,
        title: t("app.agentTab"),
        component: workspacePanelPolicy("agent").component,
        params: { kind: "agent" },
      },
    ];
    if (options.selectedThreadId.value) {
      panels.push({
        id: FILES_WORKSPACE_PANEL_ID,
        title: t("app.filesTab"),
        component: workspacePanelPolicy("files").component,
        params: { kind: "files" },
      });
    }
    panels.push(
      ...options.terminalPanels.value.map(({ id, session }) => ({
        id,
        title: session.title,
        component: workspacePanelPolicy("terminal").component,
        params: { kind: "terminal" as const, sessionId: session.sessionId },
      })),
      ...options.subAgentPanels.value.map(({ id, hostId, threadId, title }) => ({
        id,
        title,
        component: workspacePanelPolicy("subagent").component,
        params: { kind: "subagent" as const, subAgentHostId: hostId, subAgentThreadId: threadId },
      })),
      ...options.browserPanels.value.map(({ id, panel }) => ({
        id,
        title: panel.title,
        component: workspacePanelPolicy("browser").component,
        params: { kind: "browser" as const, browserPanelId: panel.panelId },
      })),
      ...options.tmuxPanels.value.map(({ id }) => ({
        id,
        title: t("app.tmuxMonitors"),
        component: workspacePanelPolicy("tmux").component,
        params: { kind: "tmux" as const },
      })),
    );
    return panels;
  }

  function reconcile(api: DockviewApi) {
    const desired = definitions();
    const desiredIds = new Set(desired.map(({ id }) => id));
    for (const panel of api.panels) {
      if (!desiredIds.has(panel.id)) {
        const params = panel.params as WorkspaceDockPanelParams;
        if (params.kind === "browser" && params.browserPanelId) {
          const session = browserStore.sessionForPanel(params.browserPanelId);
          if (session) void closeBrowserPreview(session.sessionId);
        }
        api.removePanel(panel);
      }
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

  function defaultLayout(api: DockviewApi): SerializedDockview {
    const desired = definitions();
    const panelIds = desired.map(({ id }) => id);
    const activePanelId = panelIds.includes(AGENT_WORKSPACE_PANEL_ID)
      ? AGENT_WORKSPACE_PANEL_ID
      : panelIds[0];

    return {
      grid: {
        root: {
          type: "branch",
          size: api.height,
          data: [
            {
              type: "leaf",
              size: api.width,
              data: {
                id: DEFAULT_GROUP_ID,
                views: panelIds,
                activeView: activePanelId,
              },
            },
          ],
        },
        width: api.width,
        height: api.height,
        orientation: Orientation.HORIZONTAL,
      },
      panels: Object.fromEntries(
        desired.map((definition) => [
          definition.id,
          {
            id: definition.id,
            contentComponent: definition.component,
            tabComponent: "WorkspaceDockTab",
            title: definition.title,
            renderer: "always",
            params: definition.params,
          },
        ]),
      ),
      activeGroup: DEFAULT_GROUP_ID,
    };
  }

  function closeDynamic(panel: IDockviewPanel) {
    const params = panel.params as WorkspaceDockPanelParams;
    const nextPanelId = activateNextPanel(panel);
    const handler = closeHandlers[params.kind as keyof typeof closeHandlers];
    handler?.(params as never);
    if (nextPanelId) workspaceLayout.requestPanelActivation(nextPanelId);
  }

  const closeHandlers = {
    terminal(params: Extract<WorkspaceDockPanelParams, { kind: "terminal" }>) {
      void terminalTransport.closeTerminal(params.sessionId);
    },
    subagent(params: Extract<WorkspaceDockPanelParams, { kind: "subagent" }>) {
      threadView.closeSubAgentPanel({
        hostId: params.subAgentHostId,
        threadId: params.subAgentThreadId,
      });
    },
    browser(params: Extract<WorkspaceDockPanelParams, { kind: "browser" }>) {
      const removed = browserStore.removePanel(params.browserPanelId);
      if (removed.sessionId) void closeBrowserPreview(removed.sessionId);
    },
    tmux() {
      tmuxStore.closePanel();
    },
  };

  function activateNextPanel(closingPanel: IDockviewPanel) {
    const remainingDynamic = closingPanel.api.group.panels.find((panel) => {
      if (panel.id === closingPanel.id) return false;
      const kind = (panel.params as WorkspaceDockPanelParams).kind;
      return workspacePanelPolicy(kind).dynamic;
    });
    const nextPanel =
      remainingDynamic ??
      closingPanel.api.group.panels.find((panel) => panel.id === AGENT_WORKSPACE_PANEL_ID);
    nextPanel?.api.setActive();
    return nextPanel?.id ?? null;
  }

  return { reconcile, defaultLayout, closeDynamic };
}
