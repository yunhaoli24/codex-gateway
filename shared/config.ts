import type { GatewayConfig } from "./types";

export const INITIAL_TURN_PAGE_LIMIT = 2;
export const OLDER_TURN_PAGE_LIMIT = 5;
export const SERVER_TURN_CACHE_LIMIT = 50;

export function defaultGatewayConfig(): GatewayConfig {
  return {
    version: 1,
    hosts: [],
    projects: [],
    pinnedThreads: [],
    lastOpenThread: null,
  };
}
