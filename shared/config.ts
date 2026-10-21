import type { GatewayConfig, GatewayNotificationSettings } from "./types";

// thread/timeline/list counts entries, not Turns. One long running Turn must not trigger a
// "two Turns missing" refresh or block first paint on hundreds of tools. Older entries remain
// behind the official opaque cursor and are loaded only by explicit history navigation.
export const INITIAL_TIMELINE_PAGE_LIMIT = 20;
export const TIMELINE_PAGE_LIMIT = 100;
export const SERVER_TURN_CACHE_LIMIT = 50;
export const SERVER_THREAD_CACHE_LIMIT = 100;
// Match the bounded workspace deck used by mature multi-agent clients: inactive conversations are
// data caches, not permanent mounted sessions. Ten recent threads keeps route switching fast while
// preventing many long transcripts from accumulating for the lifetime of a browser tab.
export const CLIENT_THREAD_CACHE_LIMIT = 10;
// Server snapshots and browser caches share one recent-work policy. Old intermediate work can
// always be fetched from Codex; virtualizing a row alone does not bound either cache's data.
export const COMMAND_OUTPUT_CACHE_CHARS = 128 * 1024;
export const THREAD_INTERMEDIATE_CACHE_TURNS = 3;
export const DEFAULT_BARK_SERVER_URL = "https://api.day.app";
export const DEFAULT_BARK_GROUP = "Codex Gateway";

export function defaultNotificationSettings(): GatewayNotificationSettings {
  return {
    webPush: { enabled: false },
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
    webPush: { enabled: settings?.webPush?.enabled ?? defaults.webPush.enabled },
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
    version: 2,
    hosts: [],
    pinnedThreads: [],
    notifications: defaultNotificationSettings(),
  };
}
