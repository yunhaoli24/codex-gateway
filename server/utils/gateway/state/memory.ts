import type {
  GatewayConfig,
  AppServerThreadStatus,
  HostRecord,
  PinnedThreadRecord,
  ProjectRecord,
} from "~~/shared/types";
import { normalizeNotificationSettings } from "~~/shared/config";
import { trimmedOrNull } from "~~/shared/utils/strings";
import { AsyncLocalStorage } from "node:async_hooks";

// Gateway cursors are process-local but remain numerically monotonic across normal restarts. A
// browser cursor from an older process is therefore either below every new event (and replays all
// of them) or above an empty store (and triggers an explicit gap), never in the middle of a reused
// 1..N range. Multiplying milliseconds leaves room for sustained event bursts within this process.
const PROCESS_EVENT_ID_BASE = Date.now() * 1_000;

export type StoredHostRecord = HostRecord;

export interface ThreadMetadataRecord {
  hostId: number;
  threadId: string;
  parentThreadId: string | null;
  agentNickname: string | null;
  agentRole: string | null;
  title: string | null;
  name: string | null;
  preview: string | null;
  cwd: string | null;
  status: AppServerThreadStatus;
  recencyAt: number | null;
  updatedAt: number;
}

export interface SubAgentThreadRecord {
  hostId: number;
  threadId: string;
  parentThreadId: string | null;
  updatedAt: string;
}

export interface GatewayMemoryState {
  hosts: StoredHostRecord[];
  projects: ProjectRecord[];
  pinnedThreads: PinnedThreadRecord[];
  notifications: GatewayConfig["notifications"];
  threadMetadata: ThreadMetadataRecord[];
  subAgentThreads: SubAgentThreadRecord[];
  eventEpochByHost: Record<string, string>;
  nextEventId: number;
  publishedNotificationKeys: string[];
  deliveredNotificationKeys: string[];
  pendingNotificationKeys: string[];
  configLoaded: boolean;
}

function createGatewayMemoryState(): GatewayMemoryState {
  return {
    hosts: [],
    projects: [],
    pinnedThreads: [],
    notifications: normalizeNotificationSettings(),
    threadMetadata: [],
    subAgentThreads: [],
    eventEpochByHost: {},
    nextEventId: PROCESS_EVENT_ID_BASE,
    publishedNotificationKeys: [],
    deliveredNotificationKeys: [],
    pendingNotificationKeys: [],
    configLoaded: false,
  };
}

const statesByUser = new Map<number, GatewayMemoryState>();
const userScope = new AsyncLocalStorage<number>();

export function currentGatewayUserId() {
  return userScope.getStore() ?? null;
}

export function currentGatewayMemoryState() {
  const userId = currentGatewayUserId();
  if (userId === null) {
    throw new Error("Gateway state requires an authenticated user scope");
  }
  let state = statesByUser.get(userId);
  if (state === undefined) {
    state = createGatewayMemoryState();
    statesByUser.set(userId, state);
  }
  return state;
}

export function replaceCurrentGatewayMemoryState(nextState: GatewayMemoryState) {
  const userId = currentGatewayUserId();
  if (userId === null) {
    throw new Error("Gateway state replacement requires an authenticated user scope");
  }
  statesByUser.set(userId, nextState);
}

export function runWithGatewayUser<T>(userId: number, callback: () => T): T {
  return userScope.run(userId, callback);
}

export function bindGatewayUser<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
): (...args: Args) => Result {
  const userId = currentGatewayUserId();
  if (userId === null) {
    return callback;
  }
  return (...args: Args) => runWithGatewayUser(userId, () => callback(...args));
}

export function buildGatewayMemoryState(config: GatewayConfig): GatewayMemoryState {
  return {
    ...createGatewayMemoryState(),
    hosts: config.hosts.map((host) => ({
      ...host,
      proxyUrl: trimmedOrNull(host.proxyUrl),
      hasPassword: typeof host.password === "string" && host.password.length > 0,
    })),
    pinnedThreads: normalizePinnedThreads(config.pinnedThreads ?? []),
    notifications: normalizeNotificationSettings(config.notifications),
  };
}

export function normalizePinnedThreads(threads: PinnedThreadRecord[]) {
  return threads.map((thread) => ({
    hostId: thread.hostId,
    threadId: thread.threadId.trim(),
    title: thread.title.trim(),
    subtitle: trimmedOrNull(thread.subtitle),
    projectName: trimmedOrNull(thread.projectName),
    updatedAt: thread.updatedAt ?? null,
  }));
}

export function nowIso() {
  return new Date().toISOString();
}

export function nextId(records: Array<{ id: number }>) {
  return records.reduce((max, record) => Math.max(max, record.id), 0) + 1;
}

export function toTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
  }
  return null;
}
