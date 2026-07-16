import type { TmuxMonitorThreadBinding } from "~~/shared/types";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayThreadViewStore } from "@/stores/gateway-thread-view";
import { titleForThread } from "@/stores/gateway/thread-utils/identity";

export function currentTmuxThreadBinding(hostId: number): TmuxMonitorThreadBinding | null {
  const navigation = useGatewayNavigationStore();
  if (navigation.selectedHostId !== hostId || !navigation.selectedThreadId) return null;
  const view = useGatewayThreadViewStore();
  const current = recordWithId(view.currentThread, navigation.selectedThreadId);
  const listed = navigation.threads.find(
    (thread) => String(thread.id) === navigation.selectedThreadId,
  );
  return {
    projectId: navigation.selectedProjectId,
    threadId: navigation.selectedThreadId,
    threadTitle: titleForThread(current ?? listed ?? { id: navigation.selectedThreadId }),
  };
}

function recordWithId(value: unknown, expectedId: string): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return String(record.id) === expectedId ? record : null;
}
