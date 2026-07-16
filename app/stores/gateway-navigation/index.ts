import { defineStore } from "pinia";
import { ref } from "vue";
import type { GatewayRouteSelection } from "@/stores/gateway/route-state";
import { createThreadListActions } from "./actions/thread-list";
import { createThreadPinningActions } from "./actions/thread-pinning";

const emptySelection = (): GatewayRouteSelection => ({
  hostId: null,
  projectId: null,
  threadId: null,
});

export const useGatewayNavigationStore = defineStore(
  "gateway-navigation",
  () => {
    const lastOpenThread = ref<GatewayRouteSelection>(emptySelection());
    const threads = ref<any[]>([]);
    const selectedHostId = ref<number | null>(null);
    const selectedProjectId = ref<number | null>(null);
    const selectedThreadId = ref<string | null>(null);
    const openingPinnedThreadKey = ref<string | null>(null);
    const actions = {
      ...createThreadListActions(),
      ...createThreadPinningActions(),
    };

    function rememberOpenThread(selection: GatewayRouteSelection) {
      lastOpenThread.value = { ...selection };
    }

    function resetState() {
      threads.value = [];
      selectedHostId.value = null;
      selectedProjectId.value = null;
      selectedThreadId.value = null;
      openingPinnedThreadKey.value = null;
    }

    return {
      lastOpenThread,
      threads,
      selectedHostId,
      selectedProjectId,
      selectedThreadId,
      openingPinnedThreadKey,
      rememberOpenThread,
      resetState,
      ...actions,
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
