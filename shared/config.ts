import type { GatewayConfig, GatewayNotificationSettings } from "./types";

export const INITIAL_TURN_PAGE_LIMIT = 2;
export const OLDER_TURN_PAGE_LIMIT = 5;
export const SERVER_TURN_CACHE_LIMIT = 50;
export const DEFAULT_BARK_SERVER_URL = "https://api.day.app";
export const DEFAULT_BARK_GROUP = "Codex Gateway";

export function defaultNotificationSettings(): GatewayNotificationSettings {
  return {
    bark: {
      enabled: false,
      serverUrl: DEFAULT_BARK_SERVER_URL,
      deviceKey: "",
      group: DEFAULT_BARK_GROUP,
    },
  };
}

export function normalizeNotificationSettings(
  settings?: Partial<GatewayNotificationSettings> | null,
): GatewayNotificationSettings {
  const defaults = defaultNotificationSettings();
  return {
    bark: {
      ...defaults.bark,
      ...settings?.bark,
      serverUrl: settings?.bark?.serverUrl?.trim() || defaults.bark.serverUrl,
      deviceKey: settings?.bark?.deviceKey?.trim() || "",
      group: settings?.bark?.group?.trim() || defaults.bark.group,
    },
  };
}

export function defaultGatewayConfig(): GatewayConfig {
  return {
    version: 1,
    hosts: [],
    projects: [],
    pinnedThreads: [],
    notifications: defaultNotificationSettings(),
    lastOpenThread: null,
  };
}
