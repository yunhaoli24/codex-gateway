import type { HostRecord, PinnedThreadRecord } from "~~/shared/types";
import { hostRuntimeFingerprint, pinnedThreadFingerprint } from "./host-runtime-fingerprint";

export interface HostRuntimeSlot {
  userId: number;
  hostId: number;
  host: HostRecord;
  pinnedThreads: PinnedThreadRecord[];
  fingerprint: string;
  pinnedFingerprint: string;
  generation: number;
  retryCount: number;
  timer: ReturnType<typeof setTimeout> | null;
  connecting: boolean;
}

export function createHostRuntimeSlot(
  userId: number,
  host: HostRecord,
  pinnedThreads: PinnedThreadRecord[],
): HostRuntimeSlot {
  return {
    userId,
    hostId: host.id,
    host,
    pinnedThreads,
    fingerprint: hostRuntimeFingerprint(host),
    pinnedFingerprint: pinnedThreadFingerprint(host.id, pinnedThreads),
    generation: 0,
    retryCount: 0,
    timer: null,
    connecting: false,
  };
}

export function updateHostRuntimeSlot(
  slot: HostRuntimeSlot,
  host: HostRecord,
  pinnedThreads: PinnedThreadRecord[],
) {
  const nextFingerprint = hostRuntimeFingerprint(host);
  if (slot.fingerprint !== nextFingerprint) {
    return { changedHost: true, changedPinnedThreads: true };
  }

  const nextPinnedFingerprint = pinnedThreadFingerprint(host.id, pinnedThreads);
  const changedPinnedThreads = slot.pinnedFingerprint !== nextPinnedFingerprint;
  slot.host = host;
  slot.pinnedThreads = pinnedThreads;
  slot.pinnedFingerprint = nextPinnedFingerprint;
  return { changedHost: false, changedPinnedThreads };
}
