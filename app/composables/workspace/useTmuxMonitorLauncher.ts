import { createSharedComposable, useDocumentVisibility } from "@vueuse/core";

import { storeToRefs } from "pinia";
import { computed, watch } from "vue";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { useGatewayTmuxStore } from "@/stores/gateway-tmux";

export const useTmuxMonitorLauncher = createSharedComposable(() => {
  const navigation = useGatewayNavigationStore();
  const tmux = useGatewayTmuxStore();
  const { selectedHostId } = storeToRefs(navigation);
  const visibility = useDocumentVisibility();

  watch(
    [selectedHostId, visibility],
    ([hostId, state]) => {
      if (hostId && state === "visible") void tmux.loadHost(hostId);
    },
    { immediate: true },
  );

  return {
    activeCount: computed(() => tmux.activeCount(selectedHostId.value)),
    canOpen: computed(() => Boolean(selectedHostId.value)),
    open() {
      if (selectedHostId.value) tmux.openPanel(selectedHostId.value);
    },
  };
});
