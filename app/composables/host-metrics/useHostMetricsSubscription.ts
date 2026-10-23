import { useDocumentVisibility, useElementVisibility } from "@vueuse/core";
import type { Ref } from "vue";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";

export function useHostMetricsSubscription(root: Ref<HTMLElement | null>, hostId: Ref<number>) {
  const realtime = useGatewayRealtimeStore();
  const elementVisible = useElementVisibility(root);
  const documentVisibility = useDocumentVisibility();

  watch(
    [hostId, elementVisible, documentVisibility, () => realtime.connected],
    ([nextHostId, visible, documentState, connected], _previous, onCleanup) => {
      if (!visible || documentState !== "visible" || !connected) return;
      let active = true;
      void realtime
        .request((requestId) => ({
          type: "host.metrics.subscribe",
          requestId,
          hostId: nextHostId,
        }))
        .catch(() => {
          // The shared realtime error pipeline owns user-visible transport errors. A reconnect
          // changes `connected` and retries this subscription with the latest bounded history.
        });
      onCleanup(() => {
        if (!active) return;
        active = false;
        realtime.send({ type: "host.metrics.unsubscribe", hostId: nextHostId });
      });
    },
    { immediate: true },
  );
}
