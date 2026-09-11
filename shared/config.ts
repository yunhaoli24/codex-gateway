import type { GatewayConfig, GatewayNotificationSettings } from "./types";

// Keep first paint bounded for item-heavy Codex 0.147 histories. Older turns are fetched only by
// explicit history navigation; do not silently prepend a background page after the Agent viewport
// mounts. A same-page cached view may retain a wider depth that the user already loaded.
export const INITIAL_TURN_PAGE_LIMIT = 2;
export const OLDER_TURN_PAGE_LIMIT = 5;
export const SERVER_TURN_CACHE_LIMIT = 50;
export const SERVER_THREAD_CACHE_LIMIT = 100;
// Match the bounded workspace deck used by mature multi-agent clients: inactive conversations are
// data caches, not permanent mounted sessions. Ten recent threads keeps route switching fast while
// preventing many long transcripts from accumulating for the lifetime of a browser tab.
export const CLIENT_THREAD_CACHE_LIMIT = 10;
export const CLIENT_THREAD_TURN_CACHE_LIMIT = 20;
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
  const serverUrl = settings?.bark?.serverUrl?.trim();
  const deviceKey = settings?.bark?.deviceKey?.trim();
  const group = settings?.bark?.group?.trim();
  return {
    bark: {
      ...defaults.bark,
      ...settings?.bark,
      serverUrl:
        serverUrl === "" ? defaults.bark.serverUrl : (serverUrl ?? defaults.bark.serverUrl),
      deviceKey: deviceKey ?? "",
      group: group === "" ? defaults.bark.group : (group ?? defaults.bark.group),
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
  };
}
