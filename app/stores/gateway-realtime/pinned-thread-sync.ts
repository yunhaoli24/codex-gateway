import { gatewayApi } from "@/utils/gateway-api";
import { useGatewayStore } from "@/stores/gateway";
import { useGatewayNavigationStore } from "@/stores/gateway-navigation";
import { sortThreads } from "@/stores/gateway/thread-utils/identity";
import type { GatewayConfig } from "~~/shared/types";

export function createPinnedThreadSync() {
  let pending: Promise<void> | null = null;
  let refreshAgain = false;

  function refresh() {
    if (pending) {
      // An invalidation received during the current fetch must trigger one trailing fetch.
      refreshAgain = true;
      return pending;
    }
    pending = refreshUntilCurrent().finally(() => {
      pending = null;
    });
    return pending;
  }

  async function refreshUntilCurrent() {
    do {
      refreshAgain = false;
      const config = await gatewayApi<GatewayConfig>("/api/config/export");
      applyPinnedThreads(config.pinnedThreads);
    } while (refreshAgain);
  }

  return { refresh };
}

function applyPinnedThreads(pinnedThreads: GatewayConfig["pinnedThreads"]) {
  const gateway = useGatewayStore();
  const navigation = useGatewayNavigationStore();
  gateway.gatewayConfig = { ...gateway.gatewayConfig, pinnedThreads };
  navigation.threads = sortThreads(navigation.decorateThreads(navigation.threads));
}
