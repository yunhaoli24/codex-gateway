import type { GatewayConfig, GatewayEvent, HostRecord, ProjectRecord } from "~~/shared/types";

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

interface GatewayMemoryState {
  hosts: StoredHostRecord[];
  projects: ProjectRecord[];
  lastOpenThread: GatewayConfig["lastOpenThread"];
  threadMetadata: ThreadMetadataRecord[];
  events: GatewayEvent[];
  nextEventId: number;
}

export const gatewayMemoryState: GatewayMemoryState = {
  hosts: [],
  projects: [],
  lastOpenThread: null,
  threadMetadata: [],
  events: [],
  nextEventId: 1,
};

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
