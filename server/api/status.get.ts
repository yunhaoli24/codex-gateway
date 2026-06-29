import { threadBroker } from "../utils/gateway/runtime/broker";
import { runtimeConfigStore } from "../utils/gateway/state/runtime-config";
import type { GatewayStatus } from "~~/shared/types";

export default defineEventHandler((): GatewayStatus => {
  return {
    ...runtimeConfigStore.counts(),
    activeControllers: threadBroker.status(),
  };
});
