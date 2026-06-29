import { toast } from "vue-sonner";
import type { RealtimeServerMessage } from "~~/shared/types";
import type { GatewayStoreContext } from "../types";

type HostLifecycleEvent = Extract<RealtimeServerMessage, { type: "host.lifecycle" }>["event"];

export function handleHostLifecycleRealtime(
  ctx: GatewayStoreContext,
  event: HostLifecycleEvent,
  notificationKeys: Set<string>,
) {
  const eventTime = event.createdAt ? Date.parse(event.createdAt) : Date.now();
  const current = ctx.state.hostConnectionStatuses[event.hostId];
  if (current?.updatedAt && Number.isFinite(eventTime) && eventTime < current.updatedAt) {
    return;
  }
  ctx.state.hostConnectionStatuses = {
    ...ctx.state.hostConnectionStatuses,
    [event.hostId]: {
      status: event.status,
      message: event.message,
      updatedAt: Number.isFinite(eventTime) ? eventTime : Date.now(),
    },
  };
  notifyRuntimeLifecycle(event, notificationKeys);
}

function notifyRuntimeLifecycle(event: HostLifecycleEvent, notificationKeys: Set<string>) {
  const notifyKey = `${event.hostId}:${event.status}:${event.message}`;
  if (
    (event.status === "upgrading" || event.status === "restarting") &&
    !notificationKeys.has(notifyKey)
  ) {
    notificationKeys.add(notifyKey);
    toast.info(event.message);
  }
}
