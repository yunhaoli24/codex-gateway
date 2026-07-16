import type { DockviewApi, DockviewReadyEvent, SerializedDockview } from "dockview-vue";

import { useDebounceFn } from "@vueuse/core";
import type { ComputedRef } from "vue";
import { nextTick, onBeforeUnmount, shallowRef, watch } from "vue";
import { useGatewayFileWorkspaceStore } from "@/stores/file-workspace";
import { useGatewayWorkspaceLayoutStore } from "@/stores/gateway-workspace-layout";
import {
  AGENT_WORKSPACE_PANEL_ID,
  FILES_WORKSPACE_PANEL_ID,
} from "@/stores/gateway/workspace-panels";
import { notifyPopoutBlocked } from "./actions";

export function useWorkspaceDockLifecycle(options: {
  scopeKey: ComputedRef<string>;
  fileRequestScopeKey: ComputedRef<string | null>;
  reconcile: (api: DockviewApi) => void;
  panelIds: ComputedRef<unknown>;
}) {
  const { t } = useI18n();
  const workspaceLayout = useGatewayWorkspaceLayoutStore();
  const fileWorkspace = useGatewayFileWorkspaceStore();
  const api = shallowRef<DockviewApi | null>(null);
  let lastDockedLayout: SerializedDockview | null = null;
  let disposables: Array<{ dispose(): void }> = [];
  const saveLayout = useDebounceFn(() => {
    persistLayout();
  }, 180);

  function persistLayout() {
    if (!api.value) return;
    if (api.value.getPopouts().length === 0) {
      lastDockedLayout = api.value.toJSON();
    }
    if (lastDockedLayout) workspaceLayout.saveLayout(options.scopeKey.value, lastDockedLayout);
  }

  function activate(panelId: string) {
    const panel = api.value?.getPanel(panelId);
    if (!panel) return;
    panel.api.setActive();
    panel.api.group.api.setActive();
  }

  function ready(event: DockviewReadyEvent) {
    api.value = event.api;
    const saved = workspaceLayout.layoutFor(options.scopeKey.value);
    lastDockedLayout = saved ? dockedLayout(saved) : null;
    if (saved) {
      try {
        event.api.fromJSON(lastDockedLayout!);
      } catch (error) {
        console.error("[workspace] failed to restore dock layout", error);
        event.api.clear();
      }
    }
    options.reconcile(event.api);
    activate(workspaceLayout.activePanelFor(options.scopeKey.value));
    disposables = [
      event.api.onDidLayoutChange(saveLayout),
      event.api.onWillMutateLayout((mutation) => {
        // Popouts are runtime windows. Capture the docked layout before Dockview removes the group.
        if (mutation.kind === "popout" && event.api.getPopouts().length === 0) {
          lastDockedLayout = event.api.toJSON();
          workspaceLayout.saveLayout(options.scopeKey.value, lastDockedLayout);
        }
      }),
      event.api.onDidMovePanel(({ panel }) => {
        if (
          panel.id === FILES_WORKSPACE_PANEL_ID &&
          panel.api.group.panels.some(({ id }) => id === AGENT_WORKSPACE_PANEL_ID)
        ) {
          activate(AGENT_WORKSPACE_PANEL_ID);
        }
      }),
      event.api.onDidActivePanelChange(({ panel }) => {
        if (!panel) return;
        const request = workspaceLayout.panelActivationRequest;
        if (request) {
          if (panel.id === request.panelId) {
            workspaceLayout.consumePanelActivation(request.sequence);
          } else if (event.api.getPanel(request.panelId)) {
            activate(request.panelId);
            return;
          }
        }
        workspaceLayout.setActivePanel(options.scopeKey.value, panel.id);
      }),
      event.api.onDidRemovePanel((panel) => {
        if (panel.id === AGENT_WORKSPACE_PANEL_ID || panel.id === FILES_WORKSPACE_PANEL_ID) {
          void restorePermanentPanels();
        } else {
          void restoreRequestedPanel();
        }
      }),
      event.api.onDidOpenPopoutWindowFail(() =>
        notifyPopoutBlocked({
          title: t("app.popupBlocked"),
          description: t("app.popupBlockedDescription"),
        }),
      ),
    ];
  }

  async function restoreRequestedPanel() {
    await nextTick();
    const request = workspaceLayout.panelActivationRequest;
    if (request) activate(request.panelId);
    const activePanel = api.value?.activePanel;
    if (api.value && (!activePanel || !api.value.getPanel(activePanel.id))) {
      activate(AGENT_WORKSPACE_PANEL_ID);
    }
  }

  async function restorePermanentPanels() {
    await nextTick();
    if (!api.value) return;
    const hasAgent = Boolean(api.value.getPanel(AGENT_WORKSPACE_PANEL_ID));
    const needsFiles = Boolean(options.fileRequestScopeKey.value);
    const hasFiles = Boolean(api.value.getPanel(FILES_WORKSPACE_PANEL_ID));
    if (hasAgent && (!needsFiles || hasFiles)) {
      await restoreRequestedPanel();
      return;
    }
    options.reconcile(api.value);
    await restoreRequestedPanel();
  }

  watch(
    options.panelIds,
    async () => {
      if (!api.value) return;
      options.reconcile(api.value);
      const request = workspaceLayout.panelActivationRequest;
      if (request) activate(request.panelId);
      await nextTick();
      const activePanel = api.value.activePanel;
      if (!activePanel || !api.value.getPanel(activePanel.id)) activate(AGENT_WORKSPACE_PANEL_ID);
    },
    { deep: true },
  );
  watch(
    () => workspaceLayout.panelActivationRequest,
    (request) => request && activate(request.panelId),
  );
  watch(
    () => fileWorkspace.workspaceOpenRequest,
    (request) => {
      if (request?.scopeKey === options.fileRequestScopeKey.value)
        activate(FILES_WORKSPACE_PANEL_ID);
    },
  );

  onBeforeUnmount(() => {
    persistLayout();
    disposables.forEach((disposable) => disposable.dispose());
    disposables = [];
    api.value = null;
  });

  return { ready };
}

function dockedLayout(layout: SerializedDockview): SerializedDockview {
  if (!layout.popoutGroups?.length) return layout;
  const { popoutGroups: _runtimeWindows, ...docked } = layout;
  return docked;
}
