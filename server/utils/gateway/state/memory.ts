import type {
  GatewayConfig,
  GatewayEvent,
  HostRecord,
  PinnedThreadRecord,
  ProjectRecord,
} from "~~/shared/types";
import { normalizeNotificationSettings } from "~~/shared/config";
import { AsyncLocalStorage } from "node:async_hooks";

export type StoredHostRecord = HostRecord;

export interface ThreadMetadataRecord {
  hostId: number;
  projectId: number | null;
  threadId: string;
  title: string | null;
  name: string | null;
  preview: string | null;
  cwd: string | null;
  status: unknown;
  recencyAt: number | null;
  updatedAt: number;
}

export interface ThreadSnapshotRecord {
  hostId: number;
  threadId: string;
  snapshot: unknown;
  updatedAt: string;
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
  lastOpenThread: GatewayConfig["lastOpenThread"];
  threadMetadata: ThreadMetadataRecord[];
  threadSnapshots: ThreadSnapshotRecord[];
  subAgentThreads: SubAgentThreadRecord[];
  events: GatewayEvent[];
  nextEventId: number;
  deliveredNotificationKeys: string[];
  configLoaded: boolean;
}

function createGatewayMemoryState(): GatewayMemoryState {
  return {
    hosts: [],
    projects: [],
    pinnedThreads: [],
    notifications: normalizeNotificationSettings(),
    lastOpenThread: null,
    threadMetadata: [],
    threadSnapshots: [],
    subAgentThreads: [],
    events: [],
    nextEventId: 1,
    deliveredNotificationKeys: [],
    configLoaded: false,
  };
}

const anonymousState = createGatewayMemoryState();
const statesByUser = new Map<number, GatewayMemoryState>();
const userScope = new AsyncLocalStorage<number>();

export const gatewayMemoryState = new Proxy({} as GatewayMemoryState, {
  get(_target, property: keyof GatewayMemoryState) {
    return currentGatewayMemoryState()[property];
  },
  set(_target, property: keyof GatewayMemoryState, value) {
    currentGatewayMemoryState()[property] = value as never;
    return true;
  },
});

export function currentGatewayUserId() {
  return userScope.getStore() ?? null;
}

export function currentGatewayMemoryState() {
  const userId = currentGatewayUserId();
  if (!userId) {
    return anonymousState;
  }
  let state = statesByUser.get(userId);
  if (!state) {
    state = createGatewayMemoryState();
    statesByUser.set(userId, state);
  }
  return state;
}

export function replaceCurrentGatewayMemoryState(nextState: GatewayMemoryState) {
  const userId = currentGatewayUserId();
  if (!userId) {
    Object.assign(anonymousState, nextState);
    return;
  }
  statesByUser.set(userId, nextState);
}

export function runWithGatewayUser<T>(userId: number, callback: () => T): T {
  return userScope.run(userId, callback);
}

export function bindGatewayUser<T extends (...args: any[]) => any>(callback: T): T {
  const userId = currentGatewayUserId();
  if (!userId) {
    return callback;
  }
  return ((...args: Parameters<T>) => runWithGatewayUser(userId, () => callback(...args))) as T;
}

export function buildGatewayMemoryState(config: GatewayConfig): GatewayMemoryState {
  return {
    ...createGatewayMemoryState(),
    hosts: config.hosts.map((host) => ({
      ...host,
      proxyUrl: host.proxyUrl?.trim() || null,
      hasPassword: Boolean(host.password),
    })),
    projects: (config.projects ?? []).map((project) => ({
      ...project,
      name: project.name.trim(),
      remotePath: project.remotePath.trim(),
    })),
    pinnedThreads: normalizePinnedThreads(config.pinnedThreads ?? []),
    notifications: normalizeNotificationSettings(config.notifications),
    lastOpenThread: config.lastOpenThread ?? null,
  };
}

export const initialGatewayMemoryState: GatewayMemoryState = {
  hosts: [],
  projects: [],
  pinnedThreads: [],
  notifications: normalizeNotificationSettings(),
  lastOpenThread: null,
  threadMetadata: [],
  threadSnapshots: [],
  subAgentThreads: [],
  events: [],
  nextEventId: 1,
  deliveredNotificationKeys: [],
  configLoaded: false,
};

export function normalizePinnedThreads(threads: PinnedThreadRecord[]) {
  return threads.map((thread) => ({
    hostId: thread.hostId,
    projectId: thread.projectId ?? null,
    threadId: thread.threadId.trim(),
    title: thread.title.trim(),
    subtitle: thread.subtitle?.trim() || null,
    projectName: thread.projectName?.trim() || null,
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
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
  }
  return null;
}
