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
  defaultLayout: (api: DockviewApi) => SerializedDockview;
  panelIds: ComputedRef<unknown>;
}) {
  const { t } = useI18n();
  const workspaceLayout = useGatewayWorkspaceLayoutStore();
  const fileWorkspace = useGatewayFileWorkspaceStore();
  const api = shallowRef<DockviewApi | null>(null);
  let activeScopeKey = options.scopeKey.value;
  let switchingScope = false;
  let lastDockedLayout: SerializedDockview | null = null;
  let disposables: Array<{ dispose(): void }> = [];
  const saveLayout = useDebounceFn(
    (scopeKey: string, layout: SerializedDockview) => workspaceLayout.saveLayout(scopeKey, layout),
    180,
  );

  function captureDockedLayout() {
    if (!api.value) return;
    if (api.value.getPopouts().length === 0) {
      lastDockedLayout = api.value.toJSON();
    }
    return lastDockedLayout;
  }

  function persistLayout(scopeKey = activeScopeKey) {
    const layout = captureDockedLayout();
    if (layout) workspaceLayout.saveLayout(scopeKey, layout);
  }

  function scheduleLayoutSave() {
    if (switchingScope) return;
    const layout = captureDockedLayout();
    if (layout) void saveLayout(activeScopeKey, layout);
  }

  function activate(panelId: string) {
    const panel = api.value?.getPanel(panelId);
    if (!panel) return;
    panel.api.setActive();
    panel.api.group.api.setActive();
  }

  function ready(event: DockviewReadyEvent) {
    api.value = event.api;
    activeScopeKey = options.scopeKey.value;
    initializeScope(activeScopeKey);
    disposables = [
      event.api.onDidLayoutChange(scheduleLayoutSave),
      event.api.onWillMutateLayout((mutation) => {
        if (switchingScope) return;
        // Popouts are runtime windows. Capture the docked layout before Dockview removes the group.
        if (mutation.kind === "popout" && event.api.getPopouts().length === 0) {
          lastDockedLayout = event.api.toJSON();
          workspaceLayout.saveLayout(activeScopeKey, lastDockedLayout);
        }
      }),
      event.api.onDidMovePanel(({ panel }) => {
        if (switchingScope) return;
        if (
          panel.id === FILES_WORKSPACE_PANEL_ID &&
          panel.api.group.panels.some(({ id }) => id === AGENT_WORKSPACE_PANEL_ID)
        ) {
          activate(AGENT_WORKSPACE_PANEL_ID);
        }
      }),
      event.api.onDidActivePanelChange(({ panel }) => {
        if (!panel || switchingScope) return;
        const request = workspaceLayout.panelActivationRequest;
        if (request) {
          if (panel.id === request.panelId) {
            workspaceLayout.consumePanelActivation(request.sequence);
          } else if (event.api.getPanel(request.panelId)) {
            activate(request.panelId);
            return;
          }
        }
        workspaceLayout.setActivePanel(activeScopeKey, panel.id);
      }),
      event.api.onDidRemovePanel((panel) => {
        if (switchingScope) return;
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

  function initializeScope(scopeKey: string) {
    if (!api.value) return;
    const saved = workspaceLayout.layoutFor(scopeKey);
    if (saved) {
      restoreScope(scopeKey);
      return;
    }

    // During DockviewVue's ready callback the Vue renderer registry is initialized, but content
    // adapters created through fromJSON are not yet attached by the wrapper. The documented
    // addPanel path used by reconcile performs that first mount. Later scope changes can safely use
    // fromJSON({ reuseExistingPanels: true }) because the permanent Agent adapter already exists.
    lastDockedLayout = null;
    options.reconcile(api.value);
    activate(workspaceLayout.activePanelFor(scopeKey));
  }

  function restoreScope(scopeKey: string) {
    if (!api.value) return;
    const saved = workspaceLayout.layoutFor(scopeKey);
    lastDockedLayout = saved ? dockedLayout(saved) : null;
    try {
      // Dockview owns renderer="always" Vue subtrees. Its reuse mode moves matching panels to a
      // temporary group while replacing the layout, so the Agent DOM and virtualizer survive a
      // thread switch without hidden duplicates or a destroy/recreate race. Do not replace this
      // with clear()+nextTick(): clearing disposes the adapter before Vue can commit the new panel.
      api.value.fromJSON(lastDockedLayout ?? options.defaultLayout(api.value), {
        reuseExistingPanels: true,
      });
    } catch (error) {
      console.error("[workspace] failed to restore dock layout", error);
      api.value.fromJSON(options.defaultLayout(api.value), { reuseExistingPanels: true });
    }
    options.reconcile(api.value);
    activate(workspaceLayout.activePanelFor(scopeKey));
  }

  function switchScope(scopeKey: string) {
    if (!api.value || scopeKey === activeScopeKey || switchingScope) return;
    switchingScope = true;
    try {
      // Persist before changing the key. A delayed layout event must never save the target scope's
      // geometry under the thread being left.
      persistLayout(activeScopeKey);
      for (const popout of api.value.getPopouts()) popout.window.close();
      activeScopeKey = scopeKey;
      restoreScope(scopeKey);
    } finally {
      switchingScope = false;
    }
    void restoreRequestedPanel();
  }

  async function restoreRequestedPanel() {
    await nextTick();
    if (switchingScope) return;
    const request = workspaceLayout.panelActivationRequest;
    if (request) activate(request.panelId);
    const activePanel = api.value?.activePanel;
    if (api.value && (!activePanel || !api.value.getPanel(activePanel.id))) {
      activate(AGENT_WORKSPACE_PANEL_ID);
    }
  }

  async function restorePermanentPanels() {
    await nextTick();
    if (!api.value || switchingScope) return;
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

  watch(options.scopeKey, switchScope, { flush: "sync" });
  watch(
    options.panelIds,
    async () => {
      if (!api.value || switchingScope) return;
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
    persistLayout(activeScopeKey);
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
