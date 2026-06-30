import { threadBroker } from "../utils/gateway/runtime/broker";
import { defineGatewayEventHandler } from "../utils/gateway/http/errors";
import { runtimeConfigStore } from "../utils/gateway/state/runtime-config";
import type { GatewayStatus } from "~~/shared/types";

export default defineGatewayEventHandler((): GatewayStatus => {
  return {
    ...runtimeConfigStore.counts(),
    activeControllers: threadBroker.status(),
  };
});
