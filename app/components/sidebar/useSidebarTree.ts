import { storeToRefs } from "pinia";
import { computed, nextTick, ref, watch, type Ref } from "vue";
import type { useGatewayStore } from "@/stores/gateway";
import { pinnedThreadId, pinnedThreadKey, threadKey } from "./sidebar-utils";

type GatewayStore = ReturnType<typeof useGatewayStore>;

export function useSidebarTree(store: GatewayStore, longPressTriggered: Ref<boolean>) {
  const {
    hosts,
    threads,
    projects,
    pinnedThreads,
    openingPinnedThreadKey,
    threadStatuses,
    hostConnectionStatuses,
    selectedHostId,
    selectedProjectId,
    selectedThreadId,
  } = storeToRefs(store);
  const expandedHostIds = ref<Set<number>>(new Set());
  const expandedProjectIds = ref<Set<number>>(new Set());
  const suppressTreeAutoExpand = ref(false);

  const projectThreads = computed(() =>
    threads.value.filter((thread) => !thread.pinned).slice(0, 20),
  );
  const selectedThreadIsPinned = computed(() => {
    if (!selectedHostId.value || !selectedThreadId.value) {
      return false;
    }
    return pinnedThreads.value.some(
      (thread) =>
        thread.hostId === selectedHostId.value &&
        pinnedThreadId(thread) === String(selectedThreadId.value),
    );
  });
  const projectsByHost = computed(() => {
    const byHost = new Map<number, typeof projects.value>();
    for (const project of projects.value) {
      const group = byHost.get(project.hostId) ?? [];
      group.push(project);
      byHost.set(project.hostId, group);
    }
    return byHost;
  });

  function openThread(
    threadId: string,
    context?: { hostId?: number; projectId?: number | null; replaceRoute?: boolean },
  ) {
    if (longPressTriggered.value) {
      return;
    }
    void store.openThread(threadId, context);
  }

  function openPinnedThread(thread: any) {
    if (longPressTriggered.value) {
      return;
    }
    suppressTreeAutoExpand.value = true;
    void store.openPinnedThread(thread).finally(async () => {
      await nextTick();
      expandedHostIds.value = new Set();
      expandedProjectIds.value = new Set();
      suppressTreeAutoExpand.value = false;
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
    if (event && event.button !== 0) {
      return;
    }
    const isProjectListVisible = projectId === selectedProjectId.value && !selectedThreadId.value;
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

  function startThreadInProject(project: any) {
    void store.startThread(
      {
        model: store.defaultModel?.model || store.defaultModel?.id || undefined,
      },
      {
        hostId: project.hostId,
        projectId: project.id,
      },
    );
  }

  function threadRuntimeStatus(hostId: number, threadId: string) {
    return threadStatuses.value[threadKey(hostId, threadId)] ?? "idle";
  }

  function pinnedRuntimeStatus(thread: any) {
    const key = pinnedThreadKey(thread);
    if (openingPinnedThreadKey.value === key) {
      return "running";
    }
    return threadRuntimeStatus(thread.hostId, String(thread.threadId));
  }

  watch(
    selectedHostId,
    (hostId) => {
      if (suppressTreeAutoExpand.value) return;
      if (selectedThreadIsPinned.value) return;
      if (!hostId) return;
      expandedHostIds.value = new Set(expandedHostIds.value).add(hostId);
    },
    { immediate: true },
  );

  watch(
    selectedProjectId,
    (projectId) => {
      if (suppressTreeAutoExpand.value) return;
      if (selectedThreadIsPinned.value) return;
      if (!projectId) return;
      expandedProjectIds.value = new Set(expandedProjectIds.value).add(projectId);
    },
    { immediate: true },
  );

  watch(selectedThreadIsPinned, (isPinned) => {
    if (!isPinned) return;
    expandedHostIds.value = new Set();
    expandedProjectIds.value = new Set();
  });

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
    projectThreads,
    projectsByHost,
    openThread,
    openPinnedThread,
    selectHost,
    selectProject,
    startThreadInProject,
    threadRuntimeStatus,
    pinnedRuntimeStatus,
  };
}
