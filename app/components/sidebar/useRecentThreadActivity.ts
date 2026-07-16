import { storeToRefs } from "pinia";
import { computed } from "vue";
import type { PinnedThreadRecord } from "~~/shared/types";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadRuntimeStore } from "@/stores/gateway-thread-runtime";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import {
  type ThreadActivitySummary,
  useGatewayThreadActivityStore,
} from "@/stores/gateway-thread-activity";
import { pinnedKey } from "@/stores/gateway/thread-utils/identity";

export function useRecentThreadActivity() {
  const gateway = useGatewayStore();
  const navigation = useGatewayNavigationStore();
  const runtime = useGatewayThreadRuntimeStore();
  const threadView = useGatewayThreadViewStore();
  const activity = useGatewayThreadActivityStore();
  const { summariesByKey, observedRunningThreadKeys } = storeToRefs(activity);
  const { hosts, pinnedThreads } = storeToRefs(gateway);
  const { threadStatuses, unviewedCompletedThreadKeys } = storeToRefs(runtime);

  const recentThreads = computed(() => {
    const pinnedKeys = new Set(
      pinnedThreads.value.map((thread) => pinnedKey(thread.hostId, thread.threadId)),
    );
    const unviewedKeys = new Set(unviewedCompletedThreadKeys.value);
    return observedRunningThreadKeys.value
      .map((key) => summariesByKey.value[key])
      .filter(
        (thread): thread is ThreadActivitySummary =>
          // app-server parentThreadId is the authoritative sub-agent marker.
          // Sub-agents stay in their parent workspace rather than flooding this list.
          thread !== undefined && !thread.parentThreadId && !pinnedKeys.has(keyFor(thread)),
      )
      .map((thread) => ({
        ...thread,
        id: thread.threadId,
        hostName: hosts.value.find((host) => host.id === thread.hostId)?.name ?? null,
        status: threadStatuses.value[keyFor(thread)] ?? "idle",
        completionAttention: unviewedKeys.has(keyFor(thread)),
      }))
      .sort((left, right) => {
        const runningOrder = Number(right.status === "running") - Number(left.status === "running");
        return runningOrder || right.updatedAt - left.updatedAt;
      });
  });

  function openRecentThread(thread: ThreadActivitySummary) {
    void threadView.openThread(thread.threadId, {
      hostId: thread.hostId,
      projectId: thread.projectId,
    });
  }

  function pinRecentThread(thread: ThreadActivitySummary) {
    void navigation.setPinnedThread(toPinnedThread(thread), true);
  }

  return {
    recentThreads,
    openRecentThread,
    pinRecentThread,
  };
}

function keyFor(thread: ThreadActivitySummary) {
  return pinnedKey(thread.hostId, thread.threadId);
}

function toPinnedThread(thread: ThreadActivitySummary): PinnedThreadRecord {
  return {
    hostId: thread.hostId,
    projectId: thread.projectId,
    threadId: thread.threadId,
    title: thread.title,
    subtitle: thread.cwd,
    projectName: thread.projectName,
    updatedAt: thread.updatedAt,
  };
}
