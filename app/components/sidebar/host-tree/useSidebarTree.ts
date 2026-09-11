import { storeToRefs } from "pinia";
import { computed, nextTick, ref, watch, type Ref } from "vue";
import { useGatewayCatalogStore } from "@/stores/gateway-catalog";
import { useGatewayPinnedThreads } from "@/stores/gateway-config";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadRuntimeStore } from "@/stores/gateway-thread-runtime";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import {
  pinnedThreadId,
  pinnedThreadKey,
  sortPinnedThreadsForDisplay,
  threadKey,
} from "../sidebar-utils";
import type { PinnedThreadRecord, ProjectRecord } from "../sidebar-types";

export function useSidebarTree(longPressTriggered: Ref<boolean>) {
  const store = useGatewayCatalogStore();
  const navigation = useGatewayNavigationStore();
  const runtime = useGatewayThreadRuntimeStore();
  const threadView = useGatewayThreadViewStore();
  const { hosts, projects, projectDirectoryAvailability, hostConnectionStatuses } =
    storeToRefs(store);
  const storedPinnedThreads = useGatewayPinnedThreads();
  const { threads, openingPinnedThreadKey, selectedHostId, selectedProjectId, selectedThreadId } =
    storeToRefs(navigation);
  const { unviewedCompletedThreadKeys, threadStatuses } = storeToRefs(runtime);
  const expandedHostIds = ref<Set<number>>(new Set());
  const expandedProjectIds = ref<Set<number>>(new Set());
  const expandedMissingProjectHostIds = ref<Set<number>>(new Set());
  const suppressTreeAutoExpand = ref(false);
  const pinnedThreads = computed(() =>
    sortPinnedThreadsForDisplay(storedPinnedThreads.value, hosts.value),
  );

  const projectThreads = computed(() =>
    threads.value.filter((thread) => thread.pinned !== true).slice(0, 20),
  );
  const selectedThreadIsPinned = computed(() => {
    if (
      selectedHostId.value === null ||
      selectedThreadId.value === null ||
      selectedThreadId.value === ""
    ) {
      return false;
    }
    return pinnedThreads.value.some(
      (thread) =>
        thread.hostId === selectedHostId.value &&
        pinnedThreadId(thread) === String(selectedThreadId.value),
    );
  });
  const availableProjectsByHost = computed(() => groupProjectsByHost(false));
  const missingProjectsByHost = computed(() => groupProjectsByHost(true));

  function groupProjectsByHost(missing: boolean) {
    const byHost = new Map<number, typeof projects.value>();
    for (const project of projects.value) {
      if ((projectDirectoryAvailability.value[project.id] === "missing") !== missing) {
        continue;
      }
      const group = byHost.get(project.hostId) ?? [];
      group.push(project);
      byHost.set(project.hostId, group);
    }
    return byHost;
  }

  function openThread(
    threadId: string,
    context?: { hostId?: number; projectId?: number | null; replaceRoute?: boolean },
  ) {
    if (longPressTriggered.value) {
      return;
    }
    void threadView.openThread(threadId, context);
  }

  function openPinnedThread(thread: PinnedThreadRecord) {
    if (longPressTriggered.value) {
      return;
    }
    suppressTreeAutoExpand.value = true;
    void navigation.openPinnedThread(thread).finally(() => {
      void nextTick().then(() => {
        expandedHostIds.value = new Set();
        expandedProjectIds.value = new Set();
        suppressTreeAutoExpand.value = false;
      });
    });
  }

  function selectHost(hostId: number) {
    const next = new Set(expandedHostIds.value);
    if (next.has(hostId)) {
      next.delete(hostId);
    } else {
      next.add(hostId);
    }
    expandedHostIds.value = next;
    if (hostId !== selectedHostId.value) {
      void store.selectHost(hostId);
    }
  }

  function selectProject(projectId: number, event?: MouseEvent) {
    if (longPressTriggered.value) {
      return;
    }
    if (event !== undefined && event.button !== 0) {
      return;
    }
    const isProjectListVisible =
      projectId === selectedProjectId.value &&
      (selectedThreadId.value === null || selectedThreadId.value === "");
    const next = new Set(expandedProjectIds.value);
    if (next.has(projectId) && isProjectListVisible) {
      next.delete(projectId);
    } else {
      next.add(projectId);
    }
    expandedProjectIds.value = next;
    if (!isProjectListVisible) {
      void store.selectProject(projectId);
    }
  }

  function toggleMissingProjects(hostId: number) {
    const next = new Set(expandedMissingProjectHostIds.value);
    if (next.has(hostId)) next.delete(hostId);
    else next.add(hostId);
    expandedMissingProjectHostIds.value = next;
  }

  function startThreadInProject(project: ProjectRecord) {
    // The sidebar quick-start never carries a user model selection, so it must not pin the
    // catalog default: starting without an override lets the host's own configuration decide.
    void threadView.startThread(
      {},
      {
        hostId: project.hostId,
        projectId: project.id,
      },
    );
  }

  function threadRuntimeStatus(hostId: number, threadId: string) {
    return threadStatuses.value[threadKey(hostId, threadId)] ?? "idle";
  }

  function threadCompletionAttention(hostId: number, threadId: string) {
    return unviewedCompletedThreadKeys.value.includes(threadKey(hostId, threadId));
  }

  function pinnedRuntimeStatus(thread: PinnedThreadRecord) {
    const key = pinnedThreadKey(thread);
    if (openingPinnedThreadKey.value === key) {
      return "running";
    }
    return threadRuntimeStatus(thread.hostId, String(thread.threadId));
  }

  function pinnedCompletionAttention(thread: PinnedThreadRecord) {
    return threadCompletionAttention(thread.hostId, pinnedThreadId(thread));
  }

  watch(
    selectedHostId,
    (hostId) => {
      if (suppressTreeAutoExpand.value) return;
      if (selectedThreadIsPinned.value) return;
      if (hostId === null) return;
      expandedHostIds.value = new Set(expandedHostIds.value).add(hostId);
    },
    { immediate: true },
  );

  watch(
    selectedProjectId,
    (projectId) => {
      if (suppressTreeAutoExpand.value) return;
      if (selectedThreadIsPinned.value) return;
      if (projectId === null) return;
      expandedProjectIds.value = new Set(expandedProjectIds.value).add(projectId);
    },
    { immediate: true },
  );

  watch(selectedThreadIsPinned, (isPinned) => {
    if (!isPinned) return;
    expandedHostIds.value = new Set();
    expandedProjectIds.value = new Set();
  });

  watch(
    [selectedProjectId, projectDirectoryAvailability],
    ([projectId]) => {
      if (projectId === null || projectDirectoryAvailability.value[projectId] !== "missing") return;
      const project = projects.value.find((item) => item.id === projectId);
      if (project === undefined) return;
      expandedMissingProjectHostIds.value = new Set(expandedMissingProjectHostIds.value).add(
        project.hostId,
      );
    },
    { immediate: true, deep: true },
  );

  return {
    hosts,
    threads,
    projects,
    pinnedThreads,
    hostConnectionStatuses,
    selectedHostId,
    selectedProjectId,
    selectedThreadId,
    expandedHostIds,
    expandedProjectIds,
    expandedMissingProjectHostIds,
    projectThreads,
    availableProjectsByHost,
    missingProjectsByHost,
    openThread,
    openPinnedThread,
    selectHost,
    selectProject,
    toggleMissingProjects,
    startThreadInProject,
    threadRuntimeStatus,
    threadCompletionAttention,
    pinnedRuntimeStatus,
    pinnedCompletionAttention,
  };
}
