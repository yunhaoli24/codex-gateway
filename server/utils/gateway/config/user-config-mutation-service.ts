import type { GatewayConfig } from "~~/shared/types";
import { userStore } from "../auth/users";
import { sshConnections } from "../infra/host-services";
import { hostResourceLifecycle } from "../runtime/host-resource-lifecycle";
import { hostRuntimeFingerprint } from "../runtime/host-runtime-fingerprint";
import { hostRuntimeSupervisor } from "../runtime/host-runtime-supervisor";
import {
  currentGatewayMemoryState,
  replaceCurrentGatewayMemoryState,
  type StoredHostRecord,
} from "../state/memory";
import { runtimeConfigFromMemory } from "../http/errors";
import { pinnedThreadEvents } from "./pinned-thread-events";
import { gatewayLog } from "../logging";

export class UserConfigMutationService {
  commit<T>(userId: number, mutateDraft: () => T): T {
    const previousState = currentGatewayMemoryState();
    const draftState = structuredClone(previousState);
    replaceCurrentGatewayMemoryState(draftState);
    let result: T;
    let nextConfig: GatewayConfig;
    try {
      result = mutateDraft();
      pruneDanglingHostRelations(draftState);
      nextConfig = runtimeConfigFromMemory();
    } catch (error) {
      replaceCurrentGatewayMemoryState(previousState);
      throw error;
    }

    // SQLite is the durable source of truth. Never expose the draft to subsequent requests when
    // encryption or persistence fails.
    replaceCurrentGatewayMemoryState(previousState);
    userStore.saveConfig(userId, nextConfig);
    replaceCurrentGatewayMemoryState(draftState);
    for (const host of previousState.hosts) {
      const previousRoots = previousState.workspaceRoots?.filter((root) => root.hostId === host.id);
      const nextRoots = draftState.workspaceRoots?.filter((root) => root.hostId === host.id);
      if (JSON.stringify(previousRoots) !== JSON.stringify(nextRoots)) {
        attemptRuntimeReconciliation(userId, `host:${host.id}:workspace`, () =>
          hostResourceLifecycle.workspaceChanged(userId, host.id),
        );
      }
    }
    this.reconcileCommittedConfig(
      userId,
      previousState.hosts,
      draftState.hosts,
      previousState.pinnedThreads,
      draftState.pinnedThreads,
    );
    return result;
  }

  private reconcileCommittedConfig(
    userId: number,
    previousHosts: StoredHostRecord[],
    nextHosts: StoredHostRecord[],
    previousPinnedThreads: unknown,
    nextPinnedThreads: unknown,
  ) {
    const nextById = new Map(nextHosts.map((host) => [host.id, host]));
    for (const previous of previousHosts) {
      const next = nextById.get(previous.id);
      attemptRuntimeReconciliation(userId, `host:${previous.id}:lifecycle`, () => {
        if (!next) hostResourceLifecycle.deleted(userId, previous.id);
        else hostResourceLifecycle.changed(userId, previous, next);
      });
    }
    if (hostsChanged(previousHosts, nextHosts)) {
      attemptRuntimeReconciliation(userId, "ssh-connections", () =>
        sshConnections.syncHosts(nextHosts),
      );
      attemptRuntimeReconciliation(userId, "host-runtime-supervisor", () =>
        hostRuntimeSupervisor.syncCurrentUserConfig(),
      );
    }
    if (JSON.stringify(previousPinnedThreads) !== JSON.stringify(nextPinnedThreads)) {
      attemptRuntimeReconciliation(userId, "pinned-thread-broadcast", () =>
        pinnedThreadEvents.publish(userId),
      );
    }
  }
}

function hostsChanged(previous: StoredHostRecord[], next: StoredHostRecord[]) {
  if (previous.length !== next.length) return true;
  const nextById = new Map(next.map((host) => [host.id, host]));
  return previous.some((host) => {
    const candidate = nextById.get(host.id);
    return !candidate || hostRuntimeFingerprint(host) !== hostRuntimeFingerprint(candidate);
  });
}

export const userConfigMutationService = new UserConfigMutationService();

function attemptRuntimeReconciliation(userId: number, resource: string, reconcile: () => void) {
  try {
    reconcile();
  } catch (error) {
    // Runtime resources are not transactional. Continue converging independent resources after a
    // failure instead of skipping SSH sync, supervision, or browser invalidation behind it.
    gatewayLog("error", "gateway", "committed config runtime reconciliation failed", {
      userId,
      resource,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function pruneDanglingHostRelations(state: ReturnType<typeof currentGatewayMemoryState>) {
  const hostIds = new Set(state.hosts.map((host) => host.id));

  // Relation cleanup belongs to the draft transaction, before SQLite is written. Resource
  // lifecycle callbacks run after commit and must never mutate durable configuration: doing so
  // would make memory look correct until the next restart restores orphaned rows from SQLite.
  state.projects = state.projects.filter((project) => hostIds.has(project.hostId));
  state.workspaceRoots = state.workspaceRoots?.filter((root) => hostIds.has(root.hostId));
  state.pinnedThreads = state.pinnedThreads.filter((thread) => hostIds.has(thread.hostId));
}
