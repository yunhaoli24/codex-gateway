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
import { workspaceDirectoryKey } from "~~/shared/utils/workspace";

export function useSidebarTree(longPressTriggered: Ref<boolean>) {
  const store = useGatewayCatalogStore();
  const navigation = useGatewayNavigationStore();
  const runtime = useGatewayThreadRuntimeStore();
  const threadView = useGatewayThreadViewStore();
  const {
    hosts,
    projects,
    localizedHostConnectionStatuses: hostConnectionStatuses,
  } = storeToRefs(store);
  const storedPinnedThreads = useGatewayPinnedThreads();
  const { threads, openingPinnedThreadKey, selectedHostId, selectedCwd, selectedThreadId } =
    storeToRefs(navigation);
  const { unviewedCompletedThreadKeys, threadStatuses } = storeToRefs(runtime);
  const expandedHostIds = ref<Set<number>>(new Set());
  const expandedProjectKeys = ref<Set<string>>(new Set());
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
    context?: { hostId?: number; cwd?: string | null; replaceRoute?: boolean },
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
        expandedProjectKeys.value = new Set();
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

  function selectProject(project: ProjectRecord, event?: MouseEvent) {
    if (longPressTriggered.value) {
      return;
    }
    if (event !== undefined && event.button !== 0) {
      return;
    }
    const isProjectListVisible =
      project.hostId === selectedHostId.value &&
      project.remotePath === selectedCwd.value &&
      (selectedThreadId.value === null || selectedThreadId.value === "");
    const key = workspaceDirectoryKey(project.hostId, project.remotePath);
    const next = new Set(expandedProjectKeys.value);
    if (next.has(key) && isProjectListVisible) {
      next.delete(key);
    } else {
      next.add(key);
    }
    expandedProjectKeys.value = next;
    if (!isProjectListVisible) {
      selectedHostId.value = project.hostId;
      void store.selectProject(project.remotePath);
    }
  }

  function startThreadInProject(project: ProjectRecord) {
    // The sidebar quick-start never carries a user model selection, so it must not pin the
    // catalog default: starting without an override lets the host's own configuration decide.
    void threadView.startThread(
      {},
      {
        hostId: project.hostId,
        cwd: project.remotePath,
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
    // Leaving a pinned conversation can keep the same host/cwd. Observe the pin selection too,
    // so navigating back to that directory reveals its tree without needing a second click.
    [selectedHostId, selectedCwd, selectedThreadIsPinned],
    ([hostId, cwd]) => {
      if (suppressTreeAutoExpand.value) return;
      if (selectedThreadIsPinned.value) return;
      if (hostId === null || cwd === null) return;
      expandedHostIds.value = new Set(expandedHostIds.value).add(hostId);
      expandedProjectKeys.value = new Set(expandedProjectKeys.value).add(
        workspaceDirectoryKey(hostId, cwd),
      );
    },
    { immediate: true },
  );

  watch(selectedThreadIsPinned, (isPinned) => {
    if (!isPinned) return;
    expandedHostIds.value = new Set();
    expandedProjectKeys.value = new Set();
  });

  return {
    hosts,
    threads,
    projects,
    pinnedThreads,
    hostConnectionStatuses,
    selectedHostId,
    selectedCwd,
    selectedThreadId,
    expandedHostIds,
    expandedProjectKeys,
    projectThreads,
    projectsByHost,
    openThread,
    openPinnedThread,
    selectHost,
    selectProject,
    startThreadInProject,
    threadRuntimeStatus,
    threadCompletionAttention,
    pinnedRuntimeStatus,
    pinnedCompletionAttention,
  };
}
