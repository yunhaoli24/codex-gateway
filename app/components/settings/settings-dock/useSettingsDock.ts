import type { DockviewReadyEvent, IDockviewPanel } from "dockview-vue";
import { settingsPanelKinds, settingsPanelRegistry } from "./panel-registry";

const DEFAULT_SETTINGS_PANEL = "config";

export function useSettingsDock() {
  const { t } = useI18n();

  function ready({ api }: DockviewReadyEvent) {
    let groupAnchor: IDockviewPanel | null = null;
    let defaultPanel: IDockviewPanel | null = null;

    for (const kind of settingsPanelKinds) {
      const policy = settingsPanelRegistry[kind];
      const panel: IDockviewPanel = api.addPanel({
        id: kind,
        component: policy.component,
        tabComponent: "SettingsDockTab",
        title: t(policy.titleKey),
        params: { kind },
        renderer: "always",
        // An inactive first panel does not establish api.activeGroup. Anchoring every later
        // panel to the first concrete panel keeps settings as one tab group rather than
        // accidentally creating a second column while the default tab is initialized.
        inactive: groupAnchor !== null,
        position: groupAnchor ? { referencePanel: groupAnchor, direction: "within" } : undefined,
      });
      groupAnchor ??= panel;
      if (kind === DEFAULT_SETTINGS_PANEL) defaultPanel = panel;
    }

    defaultPanel?.api.setActive();
  }

  return { ready };
}
