import type { SettingsPanelKind } from "./types";

interface SettingsPanelPolicy {
  component: string;
  titleKey: string;
}

export const settingsPanelRegistry = {
  appearance: {
    component: "SettingsDockAppearancePanel",
    titleKey: "app.appearanceSettings",
  },
  config: {
    component: "SettingsDockConfigPanel",
    titleKey: "app.configJson",
  },
  hosts: {
    component: "SettingsDockHostPanel",
    titleKey: "app.hosts",
  },
  notifications: {
    component: "SettingsDockNotificationPanel",
    titleKey: "app.notificationSettings",
  },
} satisfies Record<SettingsPanelKind, SettingsPanelPolicy>;

export const settingsPanelKinds = Object.keys(settingsPanelRegistry) as SettingsPanelKind[];
