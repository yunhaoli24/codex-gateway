import type { HostRecord } from "~~/shared/types";
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
import { activeMainThreadMonitor } from "./active-main-thread-monitor";
import { threadBroker } from "./broker";
import { hostMfaManager } from "../host-mfa/host-mfa-instance";

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
    if (userId === null) {
      return;
    }
    const state = currentGatewayMemoryState();
    this.syncUserConfig(userId, {
      hosts: state.hosts,
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
        });
      });
    }
  }

  private syncUserConfig(userId: number, config: { hosts: HostRecord[] }) {
    const activeHostIds = new Set<number>();
    for (const host of config.hosts) {
      activeHostIds.add(host.id);
      this.upsertHost(userId, host);
    }

    for (const [key, slot] of this.slots) {
      if (slot.userId === userId && !activeHostIds.has(slot.hostId)) {
        this.removeSlot(key, slot);
      }
    }
  }

  private upsertHost(userId: number, host: HostRecord) {
    const key = this.slotKey(userId, host.id);
    const existing = this.slots.get(key);
    if (existing) {
      const update = updateHostRuntimeSlot(existing, host);
      if (!update.changedHost) {
        this.scheduleExistingSlotIfNeeded(existing);
        return;
      }
      this.removeSlot(key, existing);
      const slot = createHostRuntimeSlot(userId, host);
      this.slots.set(key, slot);
      const replacedConnection = existing.connectPromise;
      if (replacedConnection !== null) {
        // A changed Host reuses the same userId:hostId registry key. Let the old generation finish
        // unwinding before the replacement can create a session, otherwise the stale task can
        // overwrite the new target after HostResourceLifecycleService closes the old resources.
        void replacedConnection.finally(() => {
          if (this.isCurrent(slot, slot.generation)) this.scheduleConnect(slot, 0);
        });
      } else {
        this.scheduleConnect(slot, 0);
      }
      return;
    }

    const slot = createHostRuntimeSlot(userId, host);
    this.slots.set(key, slot);
    if (!hostMfaManager.isMfaHost(userId, host.id)) {
      this.scheduleConnect(slot, 0);
    }
  }

  private scheduleExistingSlotIfNeeded(slot: HostRuntimeSlot) {
    if (hostMfaManager.isMfaHost(slot.userId, slot.hostId)) {
      return;
    }
    if (slot.connecting || slot.timer) {
      return;
    }
    if (slot.retryCount > 0) {
      this.scheduleConnect(slot, 0);
    }
  }

  private removeSlot(key: string, slot: HostRuntimeSlot) {
    this.clearTimer(slot);
    slot.generation += 1;
    this.slots.delete(key);
    hostMfaManager.removeHost(slot.userId, slot.hostId);
    activeMainThreadMonitor.forgetHost(slot.userId, slot.hostId);
    const connection = slot.connectPromise;
    if (connection !== null) {
      void connection
        .finally(() => {
          // HostResourceLifecycle closes the current session synchronously, but an SSH/RPC connect
          // already in flight can finish afterwards. Replacement slots wait on this same promise,
          // so closing here cannot race a new target and removes any late old-identity session.
          runWithGatewayUser(slot.userId, () => threadBroker.closeHost(slot.hostId));
        })
        .catch(() => {});
    }
  }

  private handleSessionClosed(event: HostSessionClosedEvent) {
    activeMainThreadMonitor.forgetHost(event.userId, event.hostId);
    const slot = this.slots.get(this.slotKey(event.userId, event.hostId));
    if (!slot || slot.connecting || slot.timer) {
      return;
    }
    if (hostMfaManager.isMfaHost(event.userId, event.hostId)) {
      // Reconnecting a keyboard-interactive Host without a user present would immediately block
      // the shared runtime on another verification prompt. Keep it disconnected and expose the
      // explicit sidebar action that starts a fresh connection attempt when the user is ready.
      runWithGatewayUser(event.userId, () => {
        hostLifecycleBus.emit({
          hostId: event.hostId,
          status: "mfaRequired",
          message: "SSH 连接已断开，请手动输入 MFA 验证码后重新连接",
        });
      });
      return;
    }
    this.scheduleConnect(slot, retryDelay(slot.retryCount));
  }

  connectOnDemand(userId: number, hostId: number) {
    const slot = this.slots.get(this.slotKey(userId, hostId));
    if (!slot) throw new Error(`Host ${hostId} is not configured`);
    if (!hostMfaManager.isMfaHost(userId, hostId)) {
      throw new Error(`Host ${hostId} is not waiting for MFA authentication`);
    }
    if (slot.connecting) return;
    slot.retryCount = 0;
    this.scheduleConnect(slot, 0);
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
    const connection = connectHostRuntime(slot, () => this.isCurrent(slot, generation));
    slot.connectPromise = connection;
    try {
      await connection;
      if (!this.isCurrent(slot, generation)) return;
      slot.retryCount = 0;
    } catch (error) {
      if (!this.isCurrent(slot, generation)) {
        return;
      }
      slot.retryCount += 1;
      publishHostRuntimeFailure(slot, error);
      if (!hostMfaManager.isMfaHost(slot.userId, slot.hostId)) {
        this.scheduleConnect(slot, retryDelay(slot.retryCount));
      }
    } finally {
      if (slot.connectPromise === connection) {
        slot.connectPromise = null;
        slot.connecting = false;
      }
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

  refreshableSlots() {
    if (!this.started) {
      return [];
    }
    return Array.from(this.slots.values()).filter((slot) => this.isRefreshable(slot));
  }

  private isRefreshable(slot: HostRuntimeSlot) {
    return this.started && !slot.connecting && !slot.timer;
  }

  private slotKey(userId: number, hostId: number) {
    return `${userId}:${hostId}`;
  }
}

export const hostRuntimeSupervisor = new HostRuntimeSupervisor();
