import { defineStore } from "pinia";
import { ref } from "vue";
import type { GatewayRouteSelection } from "./gateway/route-state";

const emptySelection = (): GatewayRouteSelection => ({
  hostId: null,
  projectId: null,
  threadId: null,
});

export const useGatewayNavigationStore = defineStore(
  "gateway-navigation",
  () => {
    const lastOpenThread = ref<GatewayRouteSelection>(emptySelection());

    function rememberOpenThread(selection: GatewayRouteSelection) {
      lastOpenThread.value = { ...selection };
    }

    return {
      lastOpenThread,
      rememberOpenThread,
    };
  },
  {
    persist: {
      key: "codex-gateway-navigation",
      pick: ["lastOpenThread"],
      storage: piniaPluginPersistedstate.localStorage(),
    },
  },
);
