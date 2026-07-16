export type SettingsPanelKind = "appearance" | "config" | "hosts" | "notifications";

export interface SettingsDockPanelParams {
  kind: SettingsPanelKind;
}
