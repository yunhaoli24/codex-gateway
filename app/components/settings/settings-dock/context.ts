import type { InjectionKey } from "vue";

interface SettingsDockContext {
  close(): void;
}

const SETTINGS_DOCK_CONTEXT: InjectionKey<SettingsDockContext> = Symbol("settings-dock-context");

export function provideSettingsDockContext(context: SettingsDockContext) {
  provide(SETTINGS_DOCK_CONTEXT, context);
}

export function requireSettingsDockContext() {
  const context = inject(SETTINGS_DOCK_CONTEXT);
  if (!context) throw new Error("Settings dock context is unavailable");
  return context;
}
