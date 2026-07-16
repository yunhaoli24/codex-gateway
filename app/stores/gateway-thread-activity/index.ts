import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { ProjectRecord, ThreadRuntimeStatus } from "~~/shared/types";
import { pinnedKey } from "../gateway/thread-utils/identity";

export interface ThreadActivitySummary {
  hostId: number;
  projectId: number | null;
  threadId: string;
  title: string;
  cwd: string | null;
  projectName: string | null;
  parentThreadId: string | null;
  updatedAt: number;
}

export const useGatewayThreadActivityStore = defineStore("gateway-thread-activity", () => {
  const summariesByKey = ref<Record<string, ThreadActivitySummary>>({});
  const observedRunningThreadKeys = ref<string[]>([]);
  const observedRunningThreadKeySet = computed(() => new Set(observedRunningThreadKeys.value));

  function ingestThreads(hostId: number, threads: any[], projects: ProjectRecord[]) {
    for (const thread of threads) {
      upsertThread(hostId, thread, projects);
    }
  }

  function upsertThread(hostId: number, thread: any, projects: ProjectRecord[]) {
    const threadId = String(thread?.threadId ?? thread?.id ?? "");
    if (!threadId) return;

    const key = pinnedKey(hostId, threadId);
    const existing = summariesByKey.value[key];
    const project = resolveProject(hostId, thread, projects);
    summariesByKey.value = {
      ...summariesByKey.value,
      [key]: {
        hostId,
        projectId: numberOrNull(thread?.projectId) ?? project?.id ?? existing?.projectId ?? null,
        threadId,
        title: activityTitle(thread, existing?.title ?? threadId),
        cwd: stringOrNull(thread?.cwd) ?? existing?.cwd ?? null,
        projectName: project?.name ?? existing?.projectName ?? null,
        parentThreadId:
          stringOrNull(thread?.parentThreadId ?? thread?.parent_thread_id) ??
          existing?.parentThreadId ??
          null,
        updatedAt: timestamp(thread) ?? existing?.updatedAt ?? Math.floor(Date.now() / 1000),
      },
    };
  }

  function recordRuntimeStatus(hostId: number, threadId: string, status: ThreadRuntimeStatus) {
    if (status !== "running") return;
    const key = pinnedKey(hostId, threadId);
    if (observedRunningThreadKeySet.value.has(key)) return;
    // This key set is intentionally sticky for the browser page lifetime. The
    // authoritative status may later complete, but the row remains discoverable
    // until a real page/session reset clears this store.
    observedRunningThreadKeys.value = [...observedRunningThreadKeys.value, key];
  }

  function updateTitle(hostId: number, threadId: string, title: string) {
    const key = pinnedKey(hostId, threadId);
    const existing = summariesByKey.value[key];
    if (!existing) return;
    summariesByKey.value = {
      ...summariesByKey.value,
      [key]: { ...existing, title },
    };
  }

  function resetState() {
    summariesByKey.value = {};
    observedRunningThreadKeys.value = [];
  }

  return {
    summariesByKey,
    observedRunningThreadKeys,
    ingestThreads,
    upsertThread,
    recordRuntimeStatus,
    updateTitle,
    resetState,
  };
});

function resolveProject(hostId: number, thread: any, projects: ProjectRecord[]) {
  const projectId = numberOrNull(thread?.projectId);
  if (projectId !== null) {
    return projects.find((project) => project.id === projectId && project.hostId === hostId);
  }
  const cwd = stringOrNull(thread?.cwd);
  return cwd
    ? projects.find((project) => project.hostId === hostId && project.remotePath === cwd)
    : undefined;
}

function timestamp(thread: any) {
  const raw = thread?.recencyAt ?? thread?.updatedAt ?? thread?.createdAt;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = typeof raw === "string" ? Date.parse(raw) / 1000 : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function activityTitle(thread: any, fallback: string) {
  return thread?.title || thread?.name || thread?.preview || fallback;
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
