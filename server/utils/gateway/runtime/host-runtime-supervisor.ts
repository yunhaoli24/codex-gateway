import type { HostRecord, PinnedThreadRecord } from "~~/shared/types";
import { userStore } from "../auth/users";
import {
  gatewayDatabaseExists,
  gatewayDatabaseReady,
  onGatewayDatabaseReady,
} from "../storage/database";
import {
  buildGatewayMemoryState,
  currentGatewayUserId,
  currentGatewayMemoryState,
  replaceCurrentGatewayMemoryState,
  runWithGatewayUser,
} from "../state/memory";
import { connectHostRuntime, publishHostRuntimeFailure } from "./host-runtime-connection";
import { retryDelay } from "./host-runtime-retry";
import {
  createHostRuntimeSlot,
  updateHostRuntimeSlot,
  type HostRuntimeSlot,
} from "./host-runtime-slot";
import { hostSessionEvents, type HostSessionClosedEvent } from "./host-session-events";

class HostRuntimeSupervisor {
  private readonly slots = new Map<string, HostRuntimeSlot>();
  private unsubscribeSessionClosed: (() => void) | null = null;
  private unsubscribeDatabaseReady: (() => void) | null = null;
  private bootstrappedStoredUsers = false;
  private started = false;

  start() {
    if (this.started) {
      return;
    }
    this.started = true;
    this.unsubscribeSessionClosed = hostSessionEvents.onClosed((event) =>
      this.handleSessionClosed(event),
    );
    this.unsubscribeDatabaseReady = onGatewayDatabaseReady(() => {
      this.bootstrapStoredUsers();
    });
    if (gatewayDatabaseExists() || gatewayDatabaseReady()) {
      this.bootstrapStoredUsers();
    }
  }

  stop() {
    this.started = false;
    this.unsubscribeSessionClosed?.();
    this.unsubscribeDatabaseReady?.();
    this.unsubscribeSessionClosed = null;
    this.unsubscribeDatabaseReady = null;
    this.bootstrappedStoredUsers = false;
    for (const slot of Array.from(this.slots.values())) {
      this.removeSlot(this.slotKey(slot.userId, slot.hostId), slot);
    }
  }

  syncCurrentUserConfig() {
    const userId = currentGatewayUserId();
    if (!userId) {
      return;
    }
    const state = currentGatewayMemoryState();
    this.syncUserConfig(userId, {
      hosts: state.hosts,
      pinnedThreads: state.pinnedThreads,
    });
  }

  bootstrapStoredUsers() {
    if (!this.started || this.bootstrappedStoredUsers) {
      return;
    }
    this.bootstrappedStoredUsers = true;
    for (const { user, config } of userStore.listStoredConfigs()) {
      runWithGatewayUser(user.id, () => {
        const state = currentGatewayMemoryState();
        if (!state.configLoaded) {
          const nextState = buildGatewayMemoryState(config);
          nextState.configLoaded = true;
          replaceCurrentGatewayMemoryState(nextState);
        }
        this.syncUserConfig(user.id, {
          hosts: config.hosts,
          pinnedThreads: config.pinnedThreads ?? [],
        });
      });
    }
  }

  private syncUserConfig(
    userId: number,
    config: { hosts: HostRecord[]; pinnedThreads: PinnedThreadRecord[] },
  ) {
    const activeHostIds = new Set<number>();
    for (const host of config.hosts) {
      activeHostIds.add(host.id);
      this.upsertHost(userId, host, config.pinnedThreads);
    }

    for (const [key, slot] of this.slots) {
      if (slot.userId === userId && !activeHostIds.has(slot.hostId)) {
        this.removeSlot(key, slot);
      }
    }
  }

  private upsertHost(userId: number, host: HostRecord, pinnedThreads: PinnedThreadRecord[]) {
    const key = this.slotKey(userId, host.id);
    const existing = this.slots.get(key);
    if (existing) {
      const update = updateHostRuntimeSlot(existing, host, pinnedThreads);
      if (!update.changedHost) {
        this.scheduleExistingSlotIfNeeded(existing, update.changedPinnedThreads);
        return;
      }
      this.removeSlot(key, existing);
    }

    const slot = createHostRuntimeSlot(userId, host, pinnedThreads);
    this.slots.set(key, slot);
    this.scheduleConnect(slot, 0);
  }

  private scheduleExistingSlotIfNeeded(slot: HostRuntimeSlot, changedPinnedThreads: boolean) {
    if (slot.connecting || slot.timer) {
      return;
    }
    if (changedPinnedThreads || slot.retryCount > 0) {
      this.scheduleConnect(slot, 0);
    }
  }

  private removeSlot(key: string, slot: HostRuntimeSlot) {
    this.clearTimer(slot);
    slot.generation += 1;
    this.slots.delete(key);
  }

  private handleSessionClosed(event: HostSessionClosedEvent) {
    const slot = this.slots.get(this.slotKey(event.userId, event.hostId));
    if (!slot || slot.connecting || slot.timer) {
      return;
    }
    this.scheduleConnect(slot, retryDelay(slot.retryCount));
  }

  private scheduleConnect(slot: HostRuntimeSlot, delayMs: number) {
    this.clearTimer(slot);
    const generation = slot.generation;
    slot.timer = setTimeout(() => {
      slot.timer = null;
      void this.connectSlot(slot, generation);
    }, delayMs);
  }

  private async connectSlot(slot: HostRuntimeSlot, generation: number) {
    if (!this.isCurrent(slot, generation)) {
      return;
    }
    slot.connecting = true;
    try {
      await connectHostRuntime(slot);
      slot.retryCount = 0;
    } catch (error) {
      if (!this.isCurrent(slot, generation)) {
        return;
      }
      slot.retryCount += 1;
      publishHostRuntimeFailure(slot, error);
      this.scheduleConnect(slot, retryDelay(slot.retryCount));
    } finally {
      slot.connecting = false;
    }
  }

  private isCurrent(slot: HostRuntimeSlot, generation: number) {
    return (
      this.started &&
      slot.generation === generation &&
      this.slots.get(this.slotKey(slot.userId, slot.hostId)) === slot
    );
  }

  private clearTimer(slot: HostRuntimeSlot) {
    if (slot.timer) {
      clearTimeout(slot.timer);
      slot.timer = null;
    }
  }

  private slotKey(userId: number, hostId: number) {
    return `${userId}:${hostId}`;
  }
}

export const hostRuntimeSupervisor = new HostRuntimeSupervisor();
