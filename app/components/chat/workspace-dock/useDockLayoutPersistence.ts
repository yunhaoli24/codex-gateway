import type { DockviewApi, SerializedDockview } from "dockview-vue";
import { useDebounceFn } from "@vueuse/core";
import type { Ref } from "vue";
import { useGatewayWorkspaceLayoutStore } from "@/stores/gateway-workspace-layout";

/** Persists only docked geometry. Popout windows are runtime state and intentionally never become
 * a restore target after a reload. */
export function useDockLayoutPersistence(options: {
  api: Ref<DockviewApi | null>;
  activeScopeKey: () => string;
  isSwitchingScope: () => boolean;
}) {
  const workspaceLayout = useGatewayWorkspaceLayoutStore();
  let lastDockedLayout: SerializedDockview | null = null;
  const saveLayout = useDebounceFn(
    (scopeKey: string, layout: SerializedDockview) => workspaceLayout.saveLayout(scopeKey, layout),
    180,
  );

  function captureDockedLayout() {
    const api = options.api.value;
    if (api?.getPopouts().length === 0) lastDockedLayout = api.toJSON();
    return lastDockedLayout;
  }

  function setDockedLayout(layout: SerializedDockview | null) {
    lastDockedLayout = layout;
  }

  function persistLayout(scopeKey = options.activeScopeKey()) {
    const layout = captureDockedLayout();
    if (layout) workspaceLayout.saveLayout(scopeKey, layout);
  }

  function scheduleLayoutSave() {
    if (options.isSwitchingScope()) return;
    const layout = captureDockedLayout();
    if (layout) void saveLayout(options.activeScopeKey(), layout);
  }

  function captureBeforePopout() {
    if (options.isSwitchingScope()) return;
    const api = options.api.value;
    if (!api || api.getPopouts().length > 0) return;
    lastDockedLayout = api.toJSON();
    workspaceLayout.saveLayout(options.activeScopeKey(), lastDockedLayout);
  }

  return {
    captureDockedLayout,
    setDockedLayout,
    persistLayout,
    scheduleLayoutSave,
    captureBeforePopout,
  };
}
