import { defineStore } from "pinia";
import { ref } from "vue";
import type { AgentProjectDefaults, AgentProviderId } from "~~/shared/types";
import { requestProjectDefaults } from "./transport";

export const useGatewayProjectDefaultsStore = defineStore("gateway-project-defaults", () => {
  const snapshots = ref<Record<string, AgentProjectDefaults>>({});
  const pending = new Map<string, Promise<AgentProjectDefaults>>();
  const revisions = new Map<string, number>();

  function defaultsFor(hostId: number, projectId: number, provider: AgentProviderId) {
    return snapshots.value[scopeKey(hostId, projectId, provider)] ?? null;
  }

  async function ensure(hostId: number, projectId: number, provider: AgentProviderId) {
    const key = scopeKey(hostId, projectId, provider);
    const cached = snapshots.value[key];
    if (cached !== undefined) return cached;
    const inFlight = pending.get(key);
    if (inFlight !== undefined) return inFlight;

    const requestRevision = revisions.get(key) ?? 0;
    const request = requestProjectDefaults({ hostId, projectId, provider })
      .then((defaults) => {
        if ((revisions.get(key) ?? 0) === requestRevision) {
          snapshots.value = { ...snapshots.value, [key]: defaults };
        }
        return defaults;
      })
      .finally(() => {
        if (pending.get(key) === request) pending.delete(key);
      });
    pending.set(key, request);
    return request;
  }

  function clearPending(prefix: string) {
    for (const key of pending.keys()) {
      if (!key.startsWith(prefix)) continue;
      revisions.set(key, (revisions.get(key) ?? 0) + 1);
      pending.delete(key);
    }
  }

  function clearProject(hostId: number, projectId: number) {
    const prefix = `${hostId}:${projectId}:`;
    snapshots.value = Object.fromEntries(
      Object.entries(snapshots.value).filter(([key]) => !key.startsWith(prefix)),
    );
    clearPending(prefix);
  }

  function clearHost(hostId: number) {
    const prefix = `${hostId}:`;
    snapshots.value = Object.fromEntries(
      Object.entries(snapshots.value).filter(([key]) => !key.startsWith(prefix)),
    );
    clearPending(prefix);
  }

  function reset() {
    for (const key of pending.keys()) {
      revisions.set(key, (revisions.get(key) ?? 0) + 1);
    }
    snapshots.value = {};
    pending.clear();
  }

  return { defaultsFor, ensure, clearProject, clearHost, reset };
});

function scopeKey(hostId: number, projectId: number, provider: AgentProviderId) {
  return `${hostId}:${projectId}:${provider}`;
}
