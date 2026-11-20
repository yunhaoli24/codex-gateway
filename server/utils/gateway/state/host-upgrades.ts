import { EventEmitter } from "@posva/event-emitter";
import type { HostUpgradeProgress } from "~~/shared/host-upgrade";
import type { HostWithSecret } from "../infra/ssh/ssh-types";
import { remoteUpgradeTargetKey } from "../infra/codex/codex-upgrade-target";
import { hostStore } from "./hosts";
import { bindGatewayUser } from "./memory";
import type { HostLifecycleEvent } from "./host-events";

interface UpgradeUpdate {
  key: string;
  progress: HostUpgradeProgress | null;
  failed: boolean;
}

class HostUpgradeState {
  private readonly active = new Map<string, HostUpgradeProgress>();
  private readonly events = new EventEmitter<{ updated: UpgradeUpdate }>();

  begin(host: HostWithSecret, targetVersion: string) {
    const key = remoteUpgradeTargetKey(host);
    const progress: HostUpgradeProgress = {
      targetVersion,
      phase: "preparing",
      bytes: 0,
      totalBytes: 0,
      updatedAt: new Date().toISOString(),
    };
    this.active.set(key, progress);
    this.events.emit("updated", { key, progress, failed: false });
  }

  update(host: HostWithSecret, patch: Partial<Omit<HostUpgradeProgress, "updatedAt">>) {
    const key = remoteUpgradeTargetKey(host);
    const previous = this.active.get(key);
    if (previous === undefined) throw new Error("Codex upgrade progress has not started");
    const progress: HostUpgradeProgress = {
      ...previous,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.active.set(key, progress);
    // Stage transitions are pushed immediately. Byte progress reuses the SFTP log callback;
    // settings reads that snapshot every 10s without an extra SSH/SFTP request or timer here.
    if (previous.phase !== progress.phase) {
      this.events.emit("updated", { key, progress, failed: false });
    }
  }

  finish(host: HostWithSecret, failed: boolean) {
    const key = remoteUpgradeTargetKey(host);
    if (!this.active.delete(key)) return;
    this.events.emit("updated", { key, progress: null, failed });
  }

  snapshot() {
    // Project only the authenticated user's configured aliases. Never expose the physical key,
    // another user's host IDs/names, or connection settings in the browser protocol.
    return hostStore.listWithSecret().map((host) => ({
      hostId: host.id,
      progress: this.active.get(remoteUpgradeTargetKey(host)) ?? null,
    }));
  }

  subscribe(subscriber: (event: HostLifecycleEvent) => void) {
    const deliver = bindGatewayUser((update: UpgradeUpdate) => {
      for (const host of hostStore.listWithSecret()) {
        if (remoteUpgradeTargetKey(host) !== update.key) continue;
        subscriber(this.lifecycleEvent(host, update.progress, update.failed));
      }
    });
    const unsubscribe = this.events.on("updated", deliver);
    for (const host of hostStore.listWithSecret()) {
      const progress = this.active.get(remoteUpgradeTargetKey(host));
      if (progress !== undefined) subscriber(this.lifecycleEvent(host, progress, false));
    }
    return unsubscribe;
  }

  private lifecycleEvent(
    host: HostWithSecret,
    progress: HostUpgradeProgress | null,
    failed: boolean,
  ): HostLifecycleEvent {
    return {
      hostId: host.id,
      status: failed
        ? "failed"
        : progress?.phase === "restarting" || progress === null
          ? "restarting"
          : "upgrading",
      message: failed
        ? `${host.name} 的 Codex 升级失败`
        : progress === null
          ? `${host.name} 的 Codex 升级完成，正在重新连接`
          : `${host.name} 正在升级 Codex ${progress.targetVersion}`,
      messageTranslation: {
        key: failed ? "upgradeFailed" : progress === null ? "upgradeComplete" : "upgrading",
        values: { host: host.name, version: progress?.targetVersion ?? "" },
      },
      // A new subscriber receives the current phase now, even if its last byte sample is old.
      // Using the sample time here would let newer SSH events discard this active upgrade replay.
      createdAt: new Date().toISOString(),
      upgradeProgress: progress,
    };
  }
}

export const hostUpgradeState = new HostUpgradeState();
