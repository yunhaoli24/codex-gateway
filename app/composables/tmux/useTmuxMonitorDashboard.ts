import { storeToRefs } from "pinia";
import { computed } from "vue";
import type { TmuxMonitorThreadBinding } from "~~/shared/types";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadActivityStore } from "@/stores/gateway-thread-activity";

export function useTmuxMonitorDashboard() {
  const gateway = useGatewayStore();
  const navigation = useGatewayNavigationStore();
  const activity = useGatewayThreadActivityStore();
  const { hosts } = storeToRefs(gateway);
  const { summariesByKey } = storeToRefs(activity);

  const hostNames = computed(() =>
    Object.fromEntries(hosts.value.map((host) => [host.id, host.name || host.sshHost])),
  );

  function currentThreadBindingForHost(hostId: number): TmuxMonitorThreadBinding | null {
    if (navigation.selectedHostId !== hostId || !navigation.selectedThreadId) return null;
    const summary = Object.values(summariesByKey.value).find(
      (candidate) =>
        candidate.hostId === hostId && candidate.threadId === navigation.selectedThreadId,
    );
    return {
      projectId: summary?.projectId ?? navigation.selectedProjectId,
      threadId: navigation.selectedThreadId,
      threadTitle: summary?.title || navigation.selectedThreadId,
    };
  }

  return {
    hosts,
    hostNames,
    currentHostId: computed(() => navigation.selectedHostId),
    currentThreadBindingForHost,
  };
}
