import { createSharedComposable, useDocumentVisibility } from "@vueuse/core";
import { storeToRefs } from "pinia";
import { computed, watch } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayTmuxStore } from "@/stores/gateway-tmux";

export const useTmuxMonitorLauncher = createSharedComposable(() => {
  const auth = useAuthStore();
  const gateway = useGatewayStore();
  const tmux = useGatewayTmuxStore();
  const { hosts } = storeToRefs(gateway);
  const { isAuthenticated } = storeToRefs(auth);
  const visibility = useDocumentVisibility();

  watch(
    [visibility, isAuthenticated],
    ([state, authenticated]) => {
      if (state === "visible" && authenticated) void tmux.loadSummary();
    },
    { immediate: true },
  );

  return {
    activeCount: computed(() => tmux.activeCount),
    canOpen: computed(() => hosts.value.length > 0),
    open() {
      tmux.openPanel();
    },
  };
});
