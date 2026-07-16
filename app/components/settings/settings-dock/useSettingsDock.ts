import type { DockviewReadyEvent } from "dockview-vue";
import { settingsPanelKinds, settingsPanelRegistry } from "./panel-registry";

const DEFAULT_SETTINGS_PANEL = "config";

export function useSettingsDock() {
  const { t } = useI18n();

  function ready({ api }: DockviewReadyEvent) {
    for (const kind of settingsPanelKinds) {
      const policy = settingsPanelRegistry[kind];
      const panel = api.addPanel({
        id: kind,
        component: policy.component,
        tabComponent: "SettingsDockTab",
        title: t(policy.titleKey),
        params: { kind },
        renderer: "always",
        inactive: kind !== DEFAULT_SETTINGS_PANEL,
        position: api.activeGroup
          ? { referenceGroup: api.activeGroup, direction: "within" }
          : undefined,
      });
      if (kind === DEFAULT_SETTINGS_PANEL) panel.api.setActive();
    }
  }

  return { ready };
}
